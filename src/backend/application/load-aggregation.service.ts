import type { DashboardSummary, LoadSearchResult } from "@shared/contracts/ipc";
import type { Load, Location } from "@shared/types/load";
import type { LoadBoardSummary } from "@shared/types/load-board";
import type { LocationFilter, SearchFilters } from "@shared/types/search-filters";
import type { LoadBoardRegistry } from "../adapters/load-board-registry";
import type { LoadRepository } from "../repositories/load-repository";
import type { SqliteDatabase } from "../database/sqlite-database";

export class LoadAggregationService {
  constructor(
    private readonly loadRepository: LoadRepository,
    private readonly loadBoards: LoadBoardRegistry,
    private readonly database: SqliteDatabase
  ) {}

  async getDashboardSummary(boardSummaries?: LoadBoardSummary[]): Promise<DashboardSummary> {
    const [availableLoads, boards] = await Promise.all([
      this.loadRepository.search({ statuses: ["available"] }),
      boardSummaries ? Promise.resolve(boardSummaries) : this.loadBoards.list()
    ]);

    return {
      availableLoads: availableLoads.length,
      connectedBoards: boards.filter((board) => board.connection.state === "connected").length,
      configuredBoards: boards.filter((board) => board.connection.state !== "not-configured").length,
      sampleData: true,
      lastUpdatedAt: new Date().toISOString()
    };
  }

  async search(filters: SearchFilters): Promise<LoadSearchResult> {
    const [localLoads, providerResult] = await Promise.all([
      this.loadRepository.search(filters),
      this.loadBoards.fetchNormalizedLoads(filters)
    ]);
    if (providerResult.loads.length) await this.database.cacheNormalizedLoads(providerResult.loads);
    const cachedLoads = providerResult.unavailableSources.length
      ? (await this.database.listCachedNormalizedLoads()).filter((load) =>
          providerResult.unavailableSources.includes(load.source)
        )
      : [];
    const visibleLocalLoads = providerResult.loads.length
      ? localLoads.filter((load) => !load.isSample)
      : localLoads;
    const filteredLoads = [
      ...providerResult.loads.filter((load) => matchesFilters(load, filters)),
      ...cachedLoads.filter((load) => matchesFilters(load, filters, true)),
      ...visibleLocalLoads.filter((load) => matchesFilters(load, filters, true))
    ];
    const deduplicated = deduplicateLoads(filteredLoads);
    const loads = sortLoads(deduplicated.loads, filters);
    const sourceCounts = loads.reduce<LoadSearchResult["sourceCounts"]>((counts, load) => {
      counts[load.source] = (counts[load.source] ?? 0) + 1;
      return counts;
    }, {});

    return {
      loads,
      total: loads.length,
      refreshedAt: new Date().toISOString(),
      duplicatesRemoved: deduplicated.removed,
      sourceCounts,
      warnings: [
        ...providerResult.warnings,
        ...(cachedLoads.length
          ? ["One or more sources are unavailable. Showing their normalized loads cached locally within the last 24 hours."]
          : []),
        ...localFilterWarnings(filters),
        ...(visibleLocalLoads.some((load) => load.isSample)
          ? ["Sample records remain visible alongside session-backed provider results for now."]
          : [])
      ]
    };
  }
}

function deduplicateLoads(loads: Load[]): { loads: Load[]; removed: number } {
  const exact = [...new Map(loads.map((load) => [load.id, load])).values()];
  const byFingerprint = new Map<string, Load>();
  const unmatched: Load[] = [];

  for (const load of exact) {
    const fingerprint = duplicateFingerprint(load);
    if (!fingerprint) {
      unmatched.push(load);
      continue;
    }

    const current = byFingerprint.get(fingerprint);
    if (!current) {
      byFingerprint.set(fingerprint, load);
      continue;
    }

    const preferred = completenessScore(load) > completenessScore(current) ? load : current;
    const other = preferred === load ? current : load;
    preferred.duplicateSources = [
      ...new Set([
        ...(preferred.duplicateSources ?? []),
        preferred.source,
        ...(other.duplicateSources ?? []),
        other.source
      ])
    ];
    byFingerprint.set(fingerprint, preferred);
  }

  const deduplicated = [...byFingerprint.values(), ...unmatched];
  return { loads: deduplicated, removed: loads.length - deduplicated.length };
}

function duplicateFingerprint(load: Load): string | undefined {
  const pickup = locationFingerprint(load.pickup.location);
  const delivery = locationFingerprint(load.delivery.location);
  const vehicles = load.vehicles
    .map((vehicle) =>
      [vehicle.year, vehicle.make, vehicle.model]
        .filter((value) => value !== undefined)
        .join(" ")
        .toLowerCase()
        .trim()
    )
    .filter(Boolean)
    .sort()
    .join("|");
  const availableDay = load.pickup.availableFrom?.slice(0, 10);
  const price = load.price?.amountCents;
  if (!pickup || !delivery || !vehicles || !availableDay || price === undefined) return undefined;
  return [pickup, delivery, vehicles, availableDay, price].join("::");
}

function locationFingerprint(location: Location): string | undefined {
  const city = location.city?.trim().toLowerCase();
  const state = location.state?.trim().toLowerCase();
  const postalCode = location.postalCode?.trim().toLowerCase();
  if (!city || !state || !postalCode) return undefined;
  return `${city}|${state}|${postalCode}`;
}

function completenessScore(load: Load): number {
  return [
    load.pickup.location.postalCode,
    load.delivery.location.postalCode,
    load.price,
    load.distanceMiles,
    load.postedAt,
    load.vehicles.length ? true : undefined
  ].filter((value) => value !== undefined).length;
}

function matchesFilters(load: Load, filters: SearchFilters, verifyLocationsLocally = false): boolean {
  if (filters.sources && !filters.sources.includes(load.source)) return false;
  if (filters.statuses && !filters.statuses.includes(load.status)) return false;
  if (filters.minPriceCents !== undefined && (load.price?.amountCents ?? 0) < filters.minPriceCents) {
    return false;
  }
  if (
    filters.maxPriceCents !== undefined &&
    (load.price === undefined || load.price.amountCents > filters.maxPriceCents)
  ) return false;
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
  if (filters.vehicleCountMin !== undefined && load.vehicles.length < filters.vehicleCountMin) {
    return false;
  }
  if (filters.vehicleCountMax !== undefined && load.vehicles.length > filters.vehicleCountMax) {
    return false;
  }
  if (filters.vehicleTypes?.length) {
    const requested = filters.vehicleTypes.map(normalizeVehicleType);
    if (
      !load.vehicles.some((vehicle) => {
        const actual = vehicle.vehicleType ? normalizeVehicleType(vehicle.vehicleType) : undefined;
        return actual && requested.includes(actual);
      })
    ) {
      return false;
    }
  }
  if (filters.operability === "operable") {
    if (!load.vehicles.length || load.vehicles.some((vehicle) => vehicle.operable !== true)) {
      return false;
    }
  }
  if (filters.operability === "inoperable") {
    if (!load.vehicles.some((vehicle) => vehicle.operable === false)) return false;
  }
  if (
    filters.trailerType &&
    filters.trailerType !== "all" &&
    load.trailerType !== filters.trailerType
  ) {
    return false;
  }
  if (filters.postedWithinHours !== undefined) {
    if (!load.postedAt) return false;
    const earliest = Date.now() - filters.postedWithinHours * 60 * 60 * 1_000;
    if (Date.parse(load.postedAt) < earliest) return false;
  }
  if (filters.readyToShipWithinDays !== undefined) {
    if (!load.pickup.availableFrom) return false;
    const cutoff = new Date();
    cutoff.setHours(23, 59, 59, 999);
    cutoff.setDate(cutoff.getDate() + filters.readyToShipWithinDays);
    if (Date.parse(load.pickup.availableFrom) > cutoff.getTime()) return false;
  }
  if (!matchesSuperDispatchFilters(load, filters)) return false;
  if (verifyLocationsLocally && !matchesLocation(load.pickup.location, filters.origin)) return false;
  if (verifyLocationsLocally && !matchesLocation(load.delivery.location, filters.destination)) return false;
  if (filters.availableFrom) {
    if (!load.pickup.availableFrom) return false;
    if (Date.parse(load.pickup.availableFrom) < Date.parse(filters.availableFrom)) return false;
  }
  if (filters.availableTo) {
    if (!load.pickup.availableFrom) return false;
    if (Date.parse(load.pickup.availableFrom) > Date.parse(filters.availableTo)) return false;
  }
  return true;
}

function matchesSuperDispatchFilters(load: Load, filters: SearchFilters): boolean {
  const filter = filters.superDispatch;
  if (load.source !== "super-dispatch" || !filter) return true;

  const paymentMethod = load.details?.payment?.method;
  if (filter.paymentMethods?.length && (!paymentMethod || !filter.paymentMethods.includes(paymentMethod as never))) {
    return false;
  }

  const access = load.details?.carrierAccess;
  if (filter.carrierAction === "bookable" && access?.canBook !== true) return false;
  if (filter.carrierAction === "requestable" && access?.canRequest !== true) return false;

  if (
    filter.verificationStatus === "approved" &&
    load.details?.company?.verificationStatus?.toUpperCase() !== "APPROVED"
  ) {
    return false;
  }

  if (filter.certificateRequirement === "required" && access?.certificateRequired !== true) {
    return false;
  }
  if (filter.certificateRequirement === "not-required" && access?.certificateRequired !== false) {
    return false;
  }

  if (!matchesVenueType(load.pickup.locationType, filter.pickupVenueType)) return false;
  if (!matchesVenueType(load.delivery.locationType, filter.deliveryVenueType)) return false;

  if (filter.shipperNames?.length) {
    const company = load.details?.company?.name?.toLowerCase() ?? "";
    const listed = filter.shipperNames.some((name) => company.includes(name.toLowerCase()));
    if (filter.shipperMode === "include" && !listed) return false;
    if (filter.shipperMode === "exclude" && listed) return false;
  }
  return true;
}

function matchesVenueType(
  actual: string | undefined,
  requested?: NonNullable<NonNullable<SearchFilters["superDispatch"]>["pickupVenueType"]>
): boolean {
  if (!requested || requested === "all") return true;
  const actualType = actual?.trim().toLowerCase();
  if (requested === "other") {
    return Boolean(actualType && !["dealer", "auction", "private"].includes(actualType));
  }
  return actualType === requested;
}

function normalizeVehicleType(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[()]/g, "")
    .replace(/[\s-]+/g, "_");
  return {
    SEDAN: "CAR",
    COUPE: "CAR",
    TRUCK: "PICKUP",
    PICKUP_TRUCK: "PICKUP",
    PICKUP_2_DOORS: "PICKUP",
    PICKUP_4_DOORS: "PICKUP",
    COUPE_2_DOORS: "CAR",
    TRUCK_DAYCAB: "HEAVY_EQUIPMENT",
    TRUCK_WITH_SLEEPER: "HEAVY_EQUIPMENT",
    HEAVY_MACHINERY: "HEAVY_EQUIPMENT",
    TRAILER_BUMPER_PULL: "TRAVEL_TRAILER",
    TRAILER_GOOSENECK: "TRAVEL_TRAILER",
    TRAILER_5TH_WHEEL: "TRAVEL_TRAILER",
    HEAVY: "HEAVY_EQUIPMENT",
    TRAVELTRAILER: "TRAVEL_TRAILER"
  }[normalized] ?? normalized;
}

function localFilterWarnings(filters: SearchFilters): string[] {
  const localOnSuper: string[] = [];
  if (filters.minPriceCents !== undefined) localOnSuper.push("minimum pay");
  if (filters.minRatePerMileCents !== undefined) localOnSuper.push("rate per mile");
  if (filters.operability && filters.operability !== "all") localOnSuper.push("operability");
  if (filters.trailerType && filters.trailerType !== "all") localOnSuper.push("trailer type");
  if (filters.postedWithinHours !== undefined) localOnSuper.push("posted within");
  if (filters.readyToShipWithinDays !== undefined) localOnSuper.push("ready to ship");
  if (filters.vehicleTypes?.length) localOnSuper.push("vehicle type");
  if (filters.superDispatch?.paymentMethods?.length) localOnSuper.push("payment method");
  if (filters.superDispatch?.carrierAction && filters.superDispatch.carrierAction !== "all") {
    localOnSuper.push("carrier action");
  }
  if (filters.superDispatch?.verificationStatus === "approved") {
    localOnSuper.push("shipper verification");
  }
  if (
    filters.superDispatch?.certificateRequirement &&
    filters.superDispatch.certificateRequirement !== "all"
  ) {
    localOnSuper.push("certificate requirement");
  }
  if (filters.superDispatch?.pickupVenueType && filters.superDispatch.pickupVenueType !== "all") {
    localOnSuper.push("pickup venue");
  }
  if (filters.superDispatch?.deliveryVenueType && filters.superDispatch.deliveryVenueType !== "all") {
    localOnSuper.push("delivery venue");
  }
  if (filters.superDispatch?.shipperNames?.length) localOnSuper.push("shippers");

  const warnings: string[] = [];
  if (localOnSuper.length && (!filters.sources || filters.sources.includes("super-dispatch"))) {
    warnings.push(
      `Super Dispatch: ${localOnSuper.join(", ")} ${localOnSuper.length === 1 ? "is" : "are"} finalized locally after the session search.`
    );
  }
  if (
    filters.postedWithinHours !== undefined &&
    (!filters.sources || filters.sources.includes("ship-cars"))
  ) {
    warnings.push("Ship.Cars: posted-within time is finalized locally after the session search.");
  }
  if (
    filters.vehicleTypes?.length &&
    (!filters.sources || filters.sources.some((source) => source !== "super-dispatch"))
  ) {
    warnings.push("Vehicle type is verified against normalized results from every selected board.");
  }
  if (filters.maxDistanceMiles !== undefined) {
    warnings.push("Maximum distance is verified against the returned mileage from every selected board.");
  }
  return warnings;
}

function matchesLocation(location: Location, filter?: LocationFilter): boolean {
  if (!filter) return true;
  if (
    filter.states &&
    !filter.states.some((state) => state.toLowerCase() === location.state?.toLowerCase())
  ) {
    return false;
  }
  if (
    filter.cities &&
    !filter.cities.some((city) => city.toLowerCase() === location.city?.toLowerCase())
  ) {
    return false;
  }
  if (filter.postalCodes && !filter.postalCodes.includes(location.postalCode ?? "")) {
    return false;
  }
  return true;
}

function sortLoads(loads: Load[], filters: SearchFilters): Load[] {
  const { field = "postedAt", direction = "desc" } = filters.sort ?? {};
  const factor = direction === "asc" ? 1 : -1;
  const tagHours = filters.centralDispatch?.tagListingsPostedWithinHours ?? 2;
  const showTaggedOnTop = filters.centralDispatch?.showTaggedOnTop ?? true;
  const taggedAfter = Date.now() - tagHours * 60 * 60 * 1_000;

  return [...loads].sort((left, right) => {
    if (showTaggedOnTop) {
      const leftIsTagged = isTaggedCentralLoad(left, taggedAfter);
      const rightIsTagged = isTaggedCentralLoad(right, taggedAfter);
      if (leftIsTagged !== rightIsTagged) return leftIsTagged ? -1 : 1;
    }

    const value = (load: Load): number | undefined => {
      if (field === "price") return load.price?.amountCents;
      if (field === "distanceMiles") return load.distanceMiles;
      return load.postedAt ? new Date(load.postedAt).getTime() : undefined;
    };
    const leftValue = value(left);
    const rightValue = value(right);
    if (leftValue === undefined && rightValue === undefined) return 0;
    if (leftValue === undefined) return 1;
    if (rightValue === undefined) return -1;
    return (leftValue - rightValue) * factor;
  });
}

function isTaggedCentralLoad(load: Load, taggedAfter: number): boolean {
  if (load.source !== "central-dispatch" || !load.postedAt) return false;
  const postedAt = Date.parse(load.postedAt);
  return Number.isFinite(postedAt) && postedAt >= taggedAfter;
}
