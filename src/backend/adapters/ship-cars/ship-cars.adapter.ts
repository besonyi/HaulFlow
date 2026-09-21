import { StubLoadBoardAdapter } from "../stub-load-board.adapter";
import type { AdapterLoadCandidate, AdapterSearchResult } from "../load-board-adapter";
import type { SessionSearchClient } from "../session-search-client";
import type { SearchFilters } from "@shared/types/search-filters";

export class ShipCarsAdapter extends StubLoadBoardAdapter {
  constructor(private readonly sessionSearch: SessionSearchClient) {
    super();
  }

  readonly id = "ship-cars" as const;
  readonly displayName = "Ship.Cars";
  readonly portalUrl = "https://ship.cars/app/loadboard/postings";
  readonly sessionPartition = "persist:car-hauler-ship-cars";
  readonly sessionCookieNamePatterns = [
    "keycloak_identity",
    "keycloak_session",
    "keycloak_remember_me"
  ];
  readonly endpointHostSuffixes = ["ship.cars"];
  readonly sessionSearchEndpoint = {
    method: "GET",
    origin: "https://ship.cars",
    path: "/api/cube/loadboard/v3/platform-web/postings"
  } as const;
  readonly apiDocumentationUrl = "https://shipcars.readme.io/reference/get_loadboard-v3-postings";
  readonly apiCapabilities = ["marketplace-search", "assigned-loads"] as const;
  readonly marketplaceSearchDocumented = true;
  readonly apiAccessMessage =
    "Official OAuth access to loadboard search is documented. Provider-issued API credentials are required.";

  override async searchLoads(filters: SearchFilters): Promise<AdapterSearchResult> {
    const response = await this.sessionSearch.search(this.id, filters);
    const root = asRecord(response.payload);
    const results = Array.isArray(root?.results) ? root.results : [];
    const candidates = results.flatMap((item) => {
      const candidate = mapShipCarsLoad(item, this.portalUrl);
      return candidate ? [candidate] : [];
    });

    return {
      candidates,
      fetchedAt: response.fetchedAt
    };
  }
}

function mapShipCarsLoad(value: unknown, sourceUrl: string): AdapterLoadCandidate | undefined {
  const item = asRecord(value);
  const externalId = stringValue(item?.id) ?? stringValue(item?.shipper_load_id);
  if (!item || !externalId) return undefined;

  const pickupGeo = asRecord(item.pickup_address_location);
  const deliveryGeo = asRecord(item.delivery_address_location);
  const vehicles = Array.isArray(item.vehicles) ? item.vehicles : [];

  return {
    externalId,
    source: "ship-cars",
    pickup: {
      location: {
        city: optionalString(item.pickup_city),
        state: optionalString(item.pickup_state),
        postalCode: optionalString(item.pickup_zip),
        latitude: optionalNumber(pickupGeo?.lat),
        longitude: optionalNumber(pickupGeo?.lon)
      },
      availableFrom: optionalDate(
        item.pickup_requested_date_start ?? item.first_available_date
      ),
      availableTo: optionalDate(item.pickup_requested_date_end)
    },
    delivery: {
      location: {
        city: optionalString(item.delivery_city),
        state: optionalString(item.delivery_state),
        postalCode: optionalString(item.delivery_zip),
        latitude: optionalNumber(deliveryGeo?.lat),
        longitude: optionalNumber(deliveryGeo?.lon)
      },
      availableFrom: optionalDate(item.delivery_requested_date_start),
      availableTo: optionalDate(item.delivery_requested_date_end)
    },
    vehicles: vehicles.map(mapShipCarsVehicle),
    trailerType:
      typeof item.enclosed_trailer === "boolean"
        ? item.enclosed_trailer
          ? "enclosed"
          : "open"
        : undefined,
    price: moneyFromDollars(item.total_payment_to_carrier),
    distanceMiles: optionalNumber(item.distance_imperial),
    postedAt: optionalDate(item.create_time),
    rawUpdatedAt: optionalDate(item.update_time),
    sourceUrl,
    status: mapShipCarsStatus(item.status)
  };
}

function mapShipCarsVehicle(value: unknown) {
  const vehicle = asRecord(value);
  return {
    year: optionalNumber(vehicle?.year),
    make: optionalString(vehicle?.make),
    model: optionalString(vehicle?.model),
    operable: typeof vehicle?.operable === "boolean" ? vehicle.operable : undefined,
    vehicleType: optionalString(vehicle?.type)
  };
}

function mapShipCarsStatus(value: unknown): AdapterLoadCandidate["status"] {
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
