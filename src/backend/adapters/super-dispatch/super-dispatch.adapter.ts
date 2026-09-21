import { StubLoadBoardAdapter } from "../stub-load-board.adapter";
import type { AdapterLoadCandidate, AdapterSearchResult } from "../load-board-adapter";
import type { SessionSearchClient } from "../session-search-client";
import type { SearchFilters } from "@shared/types/search-filters";
import type { Vehicle } from "@shared/types/load";

export class SuperDispatchAdapter extends StubLoadBoardAdapter {
  constructor(private readonly sessionSearch: SessionSearchClient) {
    super();
  }

  readonly id = "super-dispatch" as const;
  readonly displayName = "Super Dispatch";
  readonly portalUrl = "https://carrier.superdispatch.com/loadboard/loads";
  readonly sessionPartition = "persist:car-hauler-super-dispatch";
  readonly sessionCookieNamePatterns = ["accountsession:", "sessionid", "usertoken"];
  readonly endpointHostSuffixes = ["superdispatch.com", "superdispatch.org"];
  readonly sessionSearchEndpoint = {
    method: "POST",
    origin: "https://api.loadboard.superdispatch.com",
    path: "/internal/v3/loads/search"
  } as const;
  readonly apiDocumentationUrl = "https://developer.superdispatch.com/carrier/docs/";
  readonly apiCapabilities = ["assigned-loads", "webhooks"] as const;
  readonly marketplaceSearchDocumented = false;
  readonly apiAccessMessage =
    "Carrier API access is subscription-based and covers assigned loads. Public loadboard search is not documented for this API.";

  override async searchLoads(filters: SearchFilters): Promise<AdapterSearchResult> {
    const response = await this.sessionSearch.search(this.id, filters);
    const root = asRecord(response.payload);
    const data = Array.isArray(root?.data) ? root.data : [];
    const candidates = data.flatMap((entry) => {
      const candidate = mapSuperDispatchLoad(entry, this.portalUrl);
      return candidate ? [candidate] : [];
    });

    return {
      candidates,
      fetchedAt: response.fetchedAt
    };
  }
}

function mapSuperDispatchLoad(
  value: unknown,
  sourceUrl: string
): AdapterLoadCandidate | undefined {
  const entry = asRecord(value);
  const load = asRecord(entry?.load);
  const externalId =
    stringValue(load?.guid) ?? stringValue(load?.posting_guid) ?? stringValue(load?.number);
  if (!load || !externalId) return undefined;

  const pickup = asRecord(load.pickup);
  const delivery = asRecord(load.delivery);
  const pickupVenue = asRecord(pickup?.venue);
  const deliveryVenue = asRecord(delivery?.venue);
  const shipper = asRecord(load.shipper);
  const shipperOrder = asRecord(load.shipper_order);
  const payment = asRecord(load.payment);
  const ratingDetails = asRecord(shipper?.rating_details);
  const carrierAccess = asRecord(load.carrier_access);
  const vehicles = Array.isArray(load.vehicles) ? load.vehicles : [];
  const distanceMeters = optionalNumber(load.distance_meters);

  return {
    externalId,
    source: "super-dispatch",
    pickup: {
      location: {
        city: optionalString(pickupVenue?.city),
        state: optionalString(pickupVenue?.state)?.toUpperCase(),
        postalCode: optionalString(pickupVenue?.zip),
        metroArea: optionalString(pickupVenue?.metro_area)
      },
      availableFrom: optionalDate(pickup?.scheduled_at),
      availableTo: optionalDate(pickup?.scheduled_ends_at),
      locationType: optionalString(pickupVenue?.business_type)
    },
    delivery: {
      location: {
        city: optionalString(deliveryVenue?.city),
        state: optionalString(deliveryVenue?.state)?.toUpperCase(),
        postalCode: optionalString(deliveryVenue?.zip),
        metroArea: optionalString(deliveryVenue?.metro_area)
      },
      availableFrom: optionalDate(delivery?.scheduled_at),
      availableTo: optionalDate(delivery?.scheduled_ends_at),
      locationType: optionalString(deliveryVenue?.business_type)
    },
    vehicles: vehicles.map(mapSuperDispatchVehicle),
    trailerType: mapTrailerType(
      vehicles.some((vehicle) => asRecord(vehicle)?.requires_enclosed_trailer === true)
        ? "ENCLOSED"
        : load.transport_type ?? load.trailer_type
    ),
    price: moneyFromDollars(load.price),
    distanceMiles:
      distanceMeters === undefined ? undefined : Math.round(distanceMeters / 1_609.344),
    postedAt: optionalDate(load.posted_to_loadboard_at ?? load.created_at),
    rawUpdatedAt: optionalDate(load.changed_at),
    sourceUrl,
    status: mapSuperDispatchStatus(load.status),
    details: {
      company: {
        name: optionalString(shipper?.name),
        contactName: optionalString(shipper?.contact_name),
        phone: optionalString(shipper?.contact_phone),
        email: optionalString(shipper?.contact_email),
        overallRating: ratingOnFiveScale(ratingDetails?.overall_rating),
        overallRatingCount: optionalNumber(ratingDetails?.total_rating_count),
        verificationStatus: optionalString(shipper?.verification_status),
        movedVehiclesCount: optionalNumber(shipper?.overall_moved_vehicles_count)
      },
      payment: {
        method: optionalString(payment?.method),
        terms: optionalString(payment?.terms)
      },
      // Super Dispatch shows this as the number in the expanded load title
      // (for example: "20128 from First Class Auto Transport").
      shipperOrderId:
        stringValue(load.shipper_order_id) ??
        stringValue(load.order_number) ??
        stringValue(shipperOrder?.number) ??
        stringValue(load.number) ??
        stringValue(entry?.number),
      additionalInfo: optionalString(load.instructions),
      preDispatchNotes: optionalString(shipper?.carrier_requirements),
      pickupDateType: optionalString(pickup?.date_type),
      deliveryDateType: optionalString(delivery?.date_type),
      pickupBusinessHoursType: optionalString(pickup?.business_hours_type),
      deliveryBusinessHoursType: optionalString(delivery?.business_hours_type),
      carrierAccess: {
        canBook: optionalBoolean(carrierAccess?.can_book),
        canRequest: optionalBoolean(carrierAccess?.can_request),
        certificateRequired: optionalBoolean(carrierAccess?.is_certificate_required),
        achPaymentRequired: optionalBoolean(carrierAccess?.is_ach_payment_required)
      }
    }
  };
}

function mapTrailerType(value: unknown): AdapterLoadCandidate["trailerType"] {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("enclos")) return "enclosed";
  if (normalized.includes("open")) return "open";
  return undefined;
}

function mapSuperDispatchVehicle(value: unknown): Vehicle {
  const vehicle = asRecord(value);
  return {
    year: optionalNumber(vehicle?.year),
    make: optionalString(vehicle?.make),
    model: optionalString(vehicle?.model),
    vin: optionalString(vehicle?.vin),
    operable:
      typeof vehicle?.is_inoperable === "boolean" ? !vehicle.is_inoperable : undefined,
    vehicleType: optionalString(vehicle?.type),
    weightPounds: optionalNumeric(vehicle?.curb_weight),
    dimensions: {
      heightInches: optionalNumeric(vehicle?.height),
      lengthInches: optionalNumeric(vehicle?.length),
      widthInches: optionalNumeric(vehicle?.width)
    },
    issues: vehicle?.is_inoperable === true ? ["Inoperable"] : [],
    additionalInfo: optionalString(vehicle?.notes)
  };
}

function mapSuperDispatchStatus(value: unknown): AdapterLoadCandidate["status"] {
  if (typeof value !== "string") return "available";
  const status = value.toLowerCase();
  if (status.includes("assign") || status.includes("dispatch")) return "assigned";
  if (
    status.includes("expire") ||
    status.includes("cancel") ||
    status.includes("unpost")
  ) {
    return "expired";
  }
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

function optionalNumeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function ratingOnFiveScale(value: unknown): number | undefined {
  const rating = optionalNumber(value);
  if (rating === undefined) return undefined;
  return rating > 5 ? rating / 20 : rating;
}

function optionalDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function moneyFromDollars(value: unknown) {
  const amount = optionalNumber(value);
  return amount === undefined
    ? undefined
    : { amountCents: Math.round(amount * 100), currency: "USD" as const };
}
