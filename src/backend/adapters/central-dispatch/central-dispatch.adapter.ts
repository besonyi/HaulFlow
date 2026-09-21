import { StubLoadBoardAdapter } from "../stub-load-board.adapter";
import type { AdapterLoadCandidate, AdapterSearchResult } from "../load-board-adapter";
import type { SessionSearchClient } from "../session-search-client";
import type { SearchFilters } from "@shared/types/search-filters";
import type { Vehicle } from "@shared/types/load";

export class CentralDispatchAdapter extends StubLoadBoardAdapter {
  constructor(private readonly sessionSearch: SessionSearchClient) {
    super();
  }

  readonly id = "central-dispatch" as const;
  readonly displayName = "Central Dispatch";
  readonly portalUrl = "https://app.centraldispatch.com/search";
  readonly sessionPartition = "persist:car-hauler-central-dispatch";
  readonly sessionCookieNamePatterns = ["idsrvp", "central-dispatch-prod"];
  readonly endpointHostSuffixes = ["centraldispatch.com"];
  readonly sessionSearchEndpoint = {
    method: "POST",
    origin: "https://bff.centraldispatch.com",
    path: "/listing-search/api/open-search"
  } as const;
  readonly apiDocumentationUrl = "https://api-docs.centraldispatch.com/apis";
  readonly apiCapabilities = ["own-listings", "assigned-loads", "webhooks"] as const;
  readonly marketplaceSearchDocumented = false;
  readonly apiAccessMessage =
    "Official APIs support account listings and assigned dispatches. Carrier marketplace search requires confirmation from Central Dispatch.";

  override async searchLoads(filters: SearchFilters): Promise<AdapterSearchResult> {
    const response = await this.sessionSearch.search(this.id, filters);
    const root = asRecord(response.payload);
    const items = Array.isArray(root?.items) ? root.items : [];
    const candidates = items.flatMap((item) => {
      const candidate = mapCentralDispatchLoad(item, this.portalUrl);
      return candidate ? [candidate] : [];
    });

    return {
      candidates,
      fetchedAt: response.fetchedAt
    };
  }
}

function mapCentralDispatchLoad(value: unknown, sourceUrl: string): AdapterLoadCandidate | undefined {
  const item = asRecord(value);
  const externalId = stringValue(item?.id);
  if (!item || !externalId) return undefined;

  const origin = asRecord(item.origin);
  const destination = asRecord(item.destination);
  const originGeo = asRecord(origin?.geoCode);
  const destinationGeo = asRecord(destination?.geoCode);
  const price = asRecord(item.price);
  const cod = asRecord(price?.cod);
  const balance = asRecord(price?.balance);
  const shipper = asRecord(item.shipper);
  const overallRating = asRecord(shipper?.overallRating);
  const vehicles = Array.isArray(item.vehicles) ? item.vehicles : [];
  const desiredDeliveryDate = optionalDate(
    item.desiredDeliveryDate ?? item.deliveryDate ?? item.deliveryByDate
  );

  return {
    externalId,
    source: "central-dispatch",
    pickup: {
      location: {
        city: optionalString(origin?.city),
        state: optionalString(origin?.state),
        postalCode: optionalString(origin?.zip),
        latitude: optionalNumber(originGeo?.latitude),
        longitude: optionalNumber(originGeo?.longitude)
      },
      availableFrom: optionalDate(item.availableDate),
      availableTo: optionalDate(item.availableEndDate),
      locationType: optionalString(origin?.locationType)
    },
    delivery: {
      location: {
        city: optionalString(destination?.city),
        state: optionalString(destination?.state),
        postalCode: optionalString(destination?.zip),
        latitude: optionalNumber(destinationGeo?.latitude),
        longitude: optionalNumber(destinationGeo?.longitude)
      },
      availableTo: desiredDeliveryDate,
      locationType: optionalString(destination?.locationType)
    },
    vehicles: vehicles.map(mapCentralVehicle),
    trailerType: mapTrailerType(item.trailerType ?? item.trailer_type),
    price: moneyFromDollars(price?.total),
    distanceMiles: optionalNumber(item.distance),
    postedAt: optionalDate(item.createdDate),
    rawUpdatedAt: optionalDate(item.updatedDate ?? item.modifiedDate ?? item.createdDate),
    sourceUrl,
    status: mapCentralStatus(item.listingStatus),
    details: {
      company: {
        name: optionalString(shipper?.companyName),
        phone: optionalString(shipper?.phone),
        email: optionalString(shipper?.email),
        hours: optionalString(shipper?.hoursOfOperation),
        timeZone: optionalString(shipper?.hqTimeZone),
        tier: optionalString(shipper?.tierGroup),
        rating: optionalNumber(shipper?.rating),
        ratingCount: optionalNumber(shipper?.numberOfRatings),
        overallRating: optionalNumber(overallRating?.averageRating),
        overallRatingCount: optionalNumber(overallRating?.totalAmount),
        preferred: optionalBoolean(item.isPreferred)
      },
      payment: {
        codAmountCents: centsFromDollars(cod?.amount),
        codMethod: optionalString(cod?.paymentMethod),
        codLocation: optionalString(cod?.paymentLocation),
        balanceAmountCents: centsFromDollars(balance?.amount),
        balancePaymentTime: optionalString(balance?.paymentTime),
        balancePaymentMethod: optionalString(balance?.balancePaymentMethod),
        processingMethod: optionalString(price?.paymentProcessingMethod)
      },
      shipperOrderId: stringValue(item.shipperOrderId),
      expiresAt: optionalDate(item.expirationDate),
      desiredDeliveryDate,
      additionalInfo: optionalString(item.additionalInfo),
      preDispatchNotes: optionalString(item.preDispatchNotes),
      requiresInspection: optionalBoolean(item.requiresInspection),
      twicRequired: optionalBoolean(item.twic)
    }
  };
}

function mapTrailerType(value: unknown): AdapterLoadCandidate["trailerType"] {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("enclos")) return "enclosed";
  if (normalized.includes("drive")) return "driveaway";
  if (normalized.includes("open")) return "open";
  return undefined;
}

function mapCentralVehicle(value: unknown): Vehicle {
  const vehicle = asRecord(value);
  const shippingSpecs = asRecord(vehicle?.shippingSpecs);
  const issues = [
    issueWhen(vehicle?.noKeys, "No keys"),
    issueWhen(vehicle?.noTires, "No tires"),
    issueWhen(vehicle?.flatTire, "Flat tire"),
    issueWhen(vehicle?.frameDamage, "Frame damage"),
    issueWhen(vehicle?.doesNotRun, "Does not run"),
    issueWhen(vehicle?.doesNotSteer, "Does not steer"),
    issueWhen(vehicle?.doesNotRoll, "Does not roll"),
    issueWhen(vehicle?.inopOther, "Other inoperable condition"),
    issueWhen(vehicle?.wideLoad, "Wide load")
  ].filter((issue): issue is string => Boolean(issue));

  return {
    year: optionalNumber(vehicle?.year),
    make: optionalString(vehicle?.make),
    model: optionalString(vehicle?.model),
    vin: optionalString(vehicle?.vin),
    operable: issues.some((issue) => issue !== "Wide load") ? false : true,
    vehicleType: optionalString(vehicle?.vehicleType),
    quantity: optionalNumber(vehicle?.qty),
    color: optionalString(vehicle?.color),
    lotNumber: optionalString(vehicle?.lotNumber),
    weightPounds: optionalNumber(shippingSpecs?.weight),
    dimensions: {
      heightInches: optionalNumber(shippingSpecs?.height),
      widthInches: optionalNumber(shippingSpecs?.width),
      lengthInches: optionalNumber(shippingSpecs?.length)
    },
    issues,
    additionalInfo: optionalString(vehicle?.additionalInfo)
  };
}

function issueWhen(value: unknown, label: string): string | undefined {
  return value === true ? label : undefined;
}

function mapCentralStatus(value: unknown): AdapterLoadCandidate["status"] {
  if (typeof value !== "string") return "available";
  const status = value.toLowerCase();
  if (status.includes("assign") || status.includes("dispatch")) return "assigned";
  if (status.includes("expire") || status.includes("cancel")) return "expired";
  return "available";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function moneyFromDollars(value: unknown) {
  const amountCents = centsFromDollars(value);
  return amountCents === undefined ? undefined : { amountCents, currency: "USD" as const };
}

function centsFromDollars(value: unknown): number | undefined {
  const amount = optionalNumber(value);
  return amount === undefined ? undefined : Math.round(amount * 100);
}
