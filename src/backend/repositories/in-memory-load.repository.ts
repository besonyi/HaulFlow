import type { Load, Location } from "@shared/types/load";
import type { LocationFilter, SearchFilters } from "@shared/types/search-filters";
import type { LoadRepository } from "./load-repository";

const seededAt = "2026-09-18T12:00:00.000Z";

const sampleLoads: Load[] = [
  {
    id: "central-dispatch:sample-1001",
    externalId: "sample-1001",
    source: "central-dispatch",
    pickup: {
      location: { city: "Atlanta", state: "GA", postalCode: "30303" },
      availableFrom: "2026-09-19T13:00:00.000Z"
    },
    delivery: {
      location: { city: "Orlando", state: "FL", postalCode: "32801" },
      availableTo: "2026-09-22T21:00:00.000Z"
    },
    vehicles: [{ year: 2023, make: "Ford", model: "F-150", vehicleType: "pickup" }],
    price: { amountCents: 75000, currency: "USD" },
    distanceMiles: 438,
    ratePerMileCents: 171,
    postedAt: seededAt,
    updatedAt: seededAt,
    status: "available",
    isSample: true
  },
  {
    id: "super-dispatch:sample-2048",
    externalId: "sample-2048",
    source: "super-dispatch",
    pickup: {
      location: { city: "Dallas", state: "TX", postalCode: "75201" },
      availableFrom: "2026-09-20T14:00:00.000Z"
    },
    delivery: {
      location: { city: "Phoenix", state: "AZ", postalCode: "85001" },
      availableTo: "2026-09-24T22:00:00.000Z"
    },
    vehicles: [
      { year: 2022, make: "Toyota", model: "Camry", vehicleType: "sedan" },
      { year: 2021, make: "Honda", model: "CR-V", vehicleType: "SUV" }
    ],
    price: { amountCents: 128000, currency: "USD" },
    distanceMiles: 1_065,
    ratePerMileCents: 120,
    postedAt: "2026-09-18T11:30:00.000Z",
    updatedAt: seededAt,
    status: "available",
    isSample: true
  },
  {
    id: "ship-cars:sample-3099",
    externalId: "sample-3099",
    source: "ship-cars",
    pickup: {
      location: { city: "Chicago", state: "IL", postalCode: "60601" },
      availableFrom: "2026-09-21T13:00:00.000Z"
    },
    delivery: {
      location: { city: "Nashville", state: "TN", postalCode: "37201" },
      availableTo: "2026-09-23T22:00:00.000Z"
    },
    vehicles: [{ year: 2024, make: "Jeep", model: "Grand Cherokee", vehicleType: "SUV" }],
    price: { amountCents: 65000, currency: "USD" },
    distanceMiles: 473,
    ratePerMileCents: 137,
    postedAt: "2026-09-18T10:40:00.000Z",
    updatedAt: seededAt,
    status: "available",
    isSample: true
  }
];

export class InMemoryLoadRepository implements LoadRepository {
  async search(filters: SearchFilters): Promise<Load[]> {
    const filtered = sampleLoads.filter((load) => this.matches(load, filters));
    return this.sort(filtered, filters);
  }

  private matches(load: Load, filters: SearchFilters): boolean {
    if (filters.sources && !filters.sources.includes(load.source)) return false;
    if (filters.statuses && !filters.statuses.includes(load.status)) return false;
    if (
      filters.minPriceCents !== undefined &&
      (load.price?.amountCents ?? 0) < filters.minPriceCents
    ) {
      return false;
    }
    if (
      filters.maxPriceCents !== undefined &&
      (load.price?.amountCents ?? 0) > filters.maxPriceCents
    ) {
      return false;
    }
    if (
      filters.minRatePerMileCents !== undefined &&
      (load.ratePerMileCents ?? 0) < filters.minRatePerMileCents
    ) {
      return false;
    }
    if (
      filters.maxDistanceMiles !== undefined &&
      (load.distanceMiles ?? Number.POSITIVE_INFINITY) > filters.maxDistanceMiles
    ) {
      return false;
    }
    if (!matchesLocation(load.pickup.location, filters.origin)) return false;
    if (!matchesLocation(load.delivery.location, filters.destination)) return false;
    return true;
  }

  private sort(loads: Load[], filters: SearchFilters): Load[] {
    const { field = "postedAt", direction = "desc" } = filters.sort ?? {};
    const factor = direction === "asc" ? 1 : -1;

    return [...loads].sort((left, right) => {
      const leftValue = valueForSort(left, field);
      const rightValue = valueForSort(right, field);
      return (leftValue - rightValue) * factor;
    });
  }
}

function matchesLocation(location: Location, filter?: LocationFilter): boolean {
  if (!filter) return true;
  if (filter.states && !filter.states.some((state) => state.toLowerCase() === location.state?.toLowerCase())) {
    return false;
  }
  if (filter.cities && !filter.cities.some((city) => city.toLowerCase() === location.city?.toLowerCase())) {
    return false;
  }
  if (
    filter.postalCodes &&
    !filter.postalCodes.some((postalCode) => postalCode === location.postalCode)
  ) {
    return false;
  }
  return true;
}

function valueForSort(load: Load, field: "postedAt" | "price" | "distanceMiles"): number {
  if (field === "price") return load.price?.amountCents ?? 0;
  if (field === "distanceMiles") return load.distanceMiles ?? 0;
  return load.postedAt ? new Date(load.postedAt).getTime() : 0;
}
