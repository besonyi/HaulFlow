import {
  Clock3,
  ChevronDown,
  Filter,
  Layers3,
  MapPin,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2
  ,WifiOff
} from "lucide-react";
import { FormEvent, useEffect, useState, type ReactNode } from "react";
import type { LoadSearchResult } from "@shared/contracts/ipc";
import type { Load } from "@shared/types/load";
import type { LoadBoardId } from "@shared/types/load-board";
import type { LocationSelection } from "@shared/types/location-search";
import type { SavedSearch } from "@shared/types/saved-search";
import type { SearchFilters } from "@shared/types/search-filters";
import { desktopApi } from "@/api/client";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { RouteMapBrowser } from "@/components/route-map-browser";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type SourceChoice = "all" | LoadBoardId;
type SortChoice = "newest" | "price-desc" | "price-asc" | "distance-asc";
type CentralPaymentChoice =
  | "all"
  | "LOAD_PAYMENTS"
  | "COD_COP"
  | "COD_COP_QUICKPAY_COMCHEK";
type SuperPaymentChoice =
  | "all"
  | "cod"
  | "delivery"
  | "billing"
  | "superpay";

const centralVehicleTypeOptions = [
  { value: "ATV", label: "ATV" },
  { value: "PICKUP", label: "Pickup" },
  { value: "BOAT", label: "Boat" },
  { value: "RV", label: "RV" },
  { value: "CAR", label: "Car" },
  { value: "SUV", label: "SUV" },
  { value: "HEAVY_EQUIPMENT", label: "Heavy Equipment" },
  { value: "TRAVEL_TRAILER", label: "Travel Trailer" },
  { value: "LARGE_YACHT", label: "Large Yacht" },
  { value: "VAN", label: "Van" },
  { value: "MOTORCYCLE", label: "Motorcycle" },
  { value: "OTHER", label: "Other" }
] as const;

const superDispatchVehicleTypeOptions = [
  { value: "Sedan", label: "Sedan" },
  { value: "Coupe (2 doors)", label: "Coupe (2 doors)" },
  { value: "SUV", label: "SUV" },
  { value: "Pickup (2 doors)", label: "Pickup (2 doors)" },
  { value: "Pickup (4 doors)", label: "Pickup (4 doors)" },
  { value: "Van", label: "Van" },
  { value: "Truck (daycab)", label: "Truck (daycab)" },
  { value: "Truck (with sleeper)", label: "Truck (with sleeper)" },
  { value: "Motorcycle", label: "Motorcycle" },
  { value: "Boat", label: "Boat" },
  { value: "RV", label: "RV" },
  { value: "Heavy Machinery", label: "Heavy Machinery" },
  { value: "Freight", label: "Freight" },
  { value: "Livestock", label: "Livestock" },
  { value: "ATV", label: "ATV" },
  { value: "Trailer (Bumper Pull)", label: "Trailer (Bumper Pull)" },
  { value: "Trailer (Gooseneck)", label: "Trailer (Gooseneck)" },
  { value: "Trailer (5th Wheel)", label: "Trailer (5th Wheel)" },
  { value: "Other", label: "Other" }
] as const;

const defaultFilters: SearchFilters = {
  sources: ["super-dispatch"],
  origin: {
    cities: ["Dallas"],
    states: ["TX"],
    postalCodes: ["75201"],
    radiusMiles: 100
  },
  destination: {
    cities: ["Atlanta"],
    states: ["GA"],
    postalCodes: ["30303"],
    radiusMiles: 100
  },
  superDispatch: { searchAlongRoute: true, outOfRouteDistanceMiles: 25 },
  statuses: ["available"],
  sort: { field: "postedAt", direction: "desc" }
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

export function LoadsPage(): JSX.Element {
  const [originCity, setOriginCity] = useState("Dallas");
  const [originResolvedCity, setOriginResolvedCity] = useState("Dallas");
  const [originLocationSelected, setOriginLocationSelected] = useState(false);
  const [originState, setOriginState] = useState("TX");
  const [originPostalCode, setOriginPostalCode] = useState("75201");
  const [destinationCity, setDestinationCity] = useState("Atlanta");
  const [destinationResolvedCity, setDestinationResolvedCity] = useState("Atlanta");
  const [destinationLocationSelected, setDestinationLocationSelected] = useState(false);
  const [destinationState, setDestinationState] = useState("GA");
  const [destinationPostalCode, setDestinationPostalCode] = useState("30303");
  const [originRadius, setOriginRadius] = useState("100");
  const [destinationRadius, setDestinationRadius] = useState("100");
  const [source, setSource] = useState<SourceChoice>("super-dispatch");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [minimumRate, setMinimumRate] = useState("");
  const [maximumDistance, setMaximumDistance] = useState("");
  const [vehicleCountMin, setVehicleCountMin] = useState("");
  const [vehicleCountMax, setVehicleCountMax] = useState("");
  const [vehicleTypes, setVehicleTypes] = useState("");
  const [operability, setOperability] = useState<NonNullable<SearchFilters["operability"]>>("all");
  const [trailerType, setTrailerType] = useState<NonNullable<SearchFilters["trailerType"]>>("all");
  const [postedWithinHours, setPostedWithinHours] = useState("");
  const [readyToShipWithinDays, setReadyToShipWithinDays] = useState("");
  const [pickupFrom, setPickupFrom] = useState("");
  const [pickupTo, setPickupTo] = useState("");
  const [centralPaymentType, setCentralPaymentType] = useState<CentralPaymentChoice>("all");
  const [centralDesiredDeliveryDate, setCentralDesiredDeliveryDate] = useState("");
  const [centralVehicleSearch, setCentralVehicleSearch] = useState("");
  const [centralOrderIds, setCentralOrderIds] = useState("");
  const [centralShipperStatus, setCentralShipperStatus] = useState<
    NonNullable<NonNullable<SearchFilters["centralDispatch"]>["shipperStatus"]>
  >("not-blocked");
  const [centralMinimumRating, setCentralMinimumRating] = useState<
    NonNullable<NonNullable<SearchFilters["centralDispatch"]>["minimumRating"]>
  >("all");
  const [centralTagHours, setCentralTagHours] = useState("2");
  const [centralShowTaggedOnTop, setCentralShowTaggedOnTop] = useState(true);
  const [superPaymentMethod, setSuperPaymentMethod] = useState<SuperPaymentChoice>("all");
  const [superSearchAlongRoute, setSuperSearchAlongRoute] = useState(true);
  const [superOutOfRouteDistance, setSuperOutOfRouteDistance] = useState("25");
  const [superShipperMode, setSuperShipperMode] = useState<"include" | "exclude">("include");
  const [superShipperNames, setSuperShipperNames] = useState("");
  const [superCreateLoadAlert, setSuperCreateLoadAlert] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [routeLoad, setRouteLoad] = useState<Load>();
  const [sort, setSort] = useState<SortChoice>("newest");
  const [activeFilters, setActiveFilters] = useState<SearchFilters>(defaultFilters);
  const [result, setResult] = useState<LoadSearchResult>();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedSearchName, setSavedSearchName] = useState("");
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function runSearch(filters: SearchFilters): Promise<void> {
    setIsLoading(true);
    setError(undefined);
    setActiveFilters(filters);
    try {
      setResult(await desktopApi.loads.search(filters));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not refresh the load feed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSavedSearches(): Promise<void> {
    try {
      setSavedSearches(await desktopApi.loads.listSavedSearches());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load saved searches.");
    }
  }

  useEffect(() => {
    void runSearch(defaultFilters);
    void loadSavedSearches();
  }, []);

  function buildFilters(): SearchFilters {
    const minPrice = Number(minimumPrice);
    const maxPrice = Number(maximumPrice);
    const minRate = Number(minimumRate);
    const maxDistance = Number(maximumDistance);
    const minVehicles = Number(vehicleCountMin);
    const maxVehicles = Number(vehicleCountMax);
    const postedHours = Number(postedWithinHours);
    const readyDays = Number(readyToShipWithinDays);
    const originMiles = Number(originRadius);
    const destinationMiles = Number(destinationRadius);
    const outOfRouteMiles = Number(superOutOfRouteDistance);
    const originQuery = originCity.trim();
    const destinationQuery = destinationCity.trim();
    const originZip = originPostalCode || (/^\d{5}$/.test(originQuery) ? originQuery : "");
    const destinationZip =
      destinationPostalCode || (/^\d{5}$/.test(destinationQuery) ? destinationQuery : "");
    const originCityFilter = originResolvedCity || (originZip ? "" : originQuery);
    const destinationCityFilter =
      destinationResolvedCity || (destinationZip ? "" : destinationQuery);
    return {
      ...(source === "all" ? {} : { sources: [source] }),
      ...(originCityFilter || originState.trim() || originZip
        ? {
            origin: {
              ...(originCityFilter ? { cities: [originCityFilter] } : {}),
              ...(originState.trim() ? { states: [originState.trim().toUpperCase()] } : {}),
              ...(originZip ? { postalCodes: [originZip] } : {}),
              ...(originRadius.trim() && Number.isFinite(originMiles) && originMiles > 0
                ? { radiusMiles: Math.round(originMiles) }
                : {})
            }
          }
        : {}),
      ...(destinationCityFilter || destinationState.trim() || destinationZip
        ? {
            destination: {
              ...(destinationCityFilter ? { cities: [destinationCityFilter] } : {}),
              ...(destinationState.trim()
                ? { states: [destinationState.trim().toUpperCase()] }
                : {}),
              ...(destinationZip ? { postalCodes: [destinationZip] } : {}),
              ...(destinationRadius.trim() &&
              Number.isFinite(destinationMiles) &&
              destinationMiles > 0
                ? { radiusMiles: Math.round(destinationMiles) }
                : {})
            }
          }
        : {}),
      ...(minimumPrice.trim() && Number.isFinite(minPrice) && minPrice >= 0
        ? { minPriceCents: Math.round(minPrice * 100) }
        : {}),
      ...(maximumPrice.trim() && Number.isFinite(maxPrice) && maxPrice >= 0
        ? { maxPriceCents: Math.round(maxPrice * 100) }
        : {}),
      ...(minimumRate.trim() && Number.isFinite(minRate) && minRate >= 0
        ? { minRatePerMileCents: Math.round(minRate * 100) }
        : {}),
      ...(maximumDistance.trim() && Number.isFinite(maxDistance) && maxDistance > 0
        ? { maxDistanceMiles: Math.round(maxDistance) }
        : {}),
      ...(vehicleCountMin.trim() && Number.isFinite(minVehicles) && minVehicles > 0
        ? { vehicleCountMin: Math.round(minVehicles) }
        : {}),
      ...(vehicleCountMax.trim() && Number.isFinite(maxVehicles) && maxVehicles > 0
        ? { vehicleCountMax: Math.max(Math.round(maxVehicles), Math.round(minVehicles) || 1) }
        : {}),
      ...(vehicleTypes.trim()
        ? {
            vehicleTypes: vehicleTypes
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          }
        : {}),
      ...(operability === "all" ? {} : { operability }),
      ...(trailerType === "all" ? {} : { trailerType }),
      ...(postedWithinHours && Number.isFinite(postedHours) && postedHours > 0
        ? { postedWithinHours: Math.round(postedHours) }
        : {}),
      ...(readyToShipWithinDays && Number.isFinite(readyDays) && readyDays >= 0
        ? { readyToShipWithinDays: Math.round(readyDays) }
        : {}),
      ...(pickupFrom ? { availableFrom: new Date(`${pickupFrom}T00:00:00`).toISOString() } : {}),
      ...(pickupTo ? { availableTo: new Date(`${pickupTo}T23:59:59`).toISOString() } : {}),
      ...(source === "central-dispatch"
        ? {
            centralDispatch: {
              ...(centralPaymentType === "all"
                ? {}
                : { paymentTypes: [centralPaymentType] }),
              ...(centralDesiredDeliveryDate
                ? { desiredDeliveryDate: centralDesiredDeliveryDate }
                : {}),
              ...(centralVehicleSearch.trim()
                ? { vehicleYearMakeModel: centralVehicleSearch.trim() }
                : {}),
              ...(centralOrderIds.trim()
                ? {
                    shipperOrderIds: centralOrderIds
                      .split(",")
                      .map((value) => value.trim())
                      .filter((value) => value.length >= 4)
                  }
                : {}),
              shipperStatus: centralShipperStatus,
              minimumRating: centralMinimumRating,
              ...(centralTagHours && Number(centralTagHours) > 0
                ? { tagListingsPostedWithinHours: normalizeTagHours(centralTagHours) }
                : {}),
              showTaggedOnTop: centralShowTaggedOnTop
            }
          }
        : {}),
      ...(source === "super-dispatch"
        ? {
            superDispatch: {
              ...(superPaymentMethod === "all"
                ? {}
                : { paymentMethods: paymentMethodsForSuperChoice(superPaymentMethod) }),
              searchAlongRoute: superSearchAlongRoute,
              ...(superSearchAlongRoute &&
              superOutOfRouteDistance.trim() &&
              Number.isFinite(outOfRouteMiles) &&
              outOfRouteMiles > 0
                ? { outOfRouteDistanceMiles: Math.round(outOfRouteMiles) }
                : {}),
              shipperMode: superShipperMode,
              ...(superShipperNames.trim()
                ? {
                    shipperNames: superShipperNames
                      .split(",")
                      .map((name) => name.trim())
                      .filter(Boolean)
                  }
                : {})
            }
          }
        : {}),
      statuses: ["available"],
      sort: sortToFilter(sort)
    };
  }

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (requiresCentralExactLocation()) {
      setError("Central Dispatch requires selecting the exact origin and destination autocomplete result before applying this filter.");
      return;
    }
    void runSearch(buildFilters());
  }

  async function saveCurrentSearch(): Promise<void> {
    const name = savedSearchName.trim();
    if (!name) {
      setError("Enter a name before saving this search.");
      return;
    }
    if (requiresCentralExactLocation()) {
      setError("Select the exact Central Dispatch autocomplete result before saving this filter.");
      return;
    }

    setIsSaving(true);
    setError(undefined);
    try {
      const saved = await desktopApi.loads.saveSearch({ name, filters: buildFilters() });
      setSavedSearches((current) => [saved, ...current]);
      setSavedSearchName("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this search.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSavedSearch(id: string): Promise<void> {
    try {
      await desktopApi.loads.deleteSavedSearch(id);
      setSavedSearches((current) => current.filter((search) => search.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this search.");
    }
  }

  function applySavedSearch(savedSearch: SavedSearch): void {
    const savedOriginCity = savedSearch.filters.origin?.cities?.[0] ?? "";
    const savedOriginZip = savedSearch.filters.origin?.postalCodes?.[0] ?? "";
    const savedDestinationCity = savedSearch.filters.destination?.cities?.[0] ?? "";
    const savedDestinationZip = savedSearch.filters.destination?.postalCodes?.[0] ?? "";
    setOriginCity(savedOriginCity || savedOriginZip || savedSearch.filters.origin?.states?.[0] || "");
    setOriginResolvedCity(savedOriginCity);
    setOriginLocationSelected(false);
    setOriginState(savedSearch.filters.origin?.states?.[0] ?? "");
    setOriginPostalCode(savedOriginZip);
    setDestinationCity(
      savedDestinationCity || savedDestinationZip || savedSearch.filters.destination?.states?.[0] || ""
    );
    setDestinationResolvedCity(savedDestinationCity);
    setDestinationLocationSelected(false);
    setDestinationState(savedSearch.filters.destination?.states?.[0] ?? "");
    setDestinationPostalCode(savedDestinationZip);
    setOriginRadius(String(savedSearch.filters.origin?.radiusMiles ?? 100));
    setDestinationRadius(String(savedSearch.filters.destination?.radiusMiles ?? 100));
    setSource(savedSearch.filters.sources?.[0] ?? "all");
    setMinimumPrice(
      savedSearch.filters.minPriceCents === undefined
        ? ""
        : String(savedSearch.filters.minPriceCents / 100)
    );
    setMaximumDistance(
      savedSearch.filters.maxDistanceMiles === undefined
        ? ""
        : String(savedSearch.filters.maxDistanceMiles)
    );
    setMaximumPrice(
      savedSearch.filters.maxPriceCents === undefined
        ? ""
        : String(savedSearch.filters.maxPriceCents / 100)
    );
    setMinimumRate(
      savedSearch.filters.minRatePerMileCents === undefined
        ? ""
        : String(savedSearch.filters.minRatePerMileCents / 100)
    );
    setVehicleCountMin(String(savedSearch.filters.vehicleCountMin ?? ""));
    setVehicleCountMax(String(savedSearch.filters.vehicleCountMax ?? ""));
    setVehicleTypes(savedSearch.filters.vehicleTypes?.join(", ") ?? "");
    setOperability(savedSearch.filters.operability ?? "all");
    setTrailerType(savedSearch.filters.trailerType ?? "all");
    setPostedWithinHours(String(savedSearch.filters.postedWithinHours ?? ""));
    setReadyToShipWithinDays(String(savedSearch.filters.readyToShipWithinDays ?? ""));
    setPickupFrom(savedSearch.filters.availableFrom?.slice(0, 10) ?? "");
    setPickupTo(savedSearch.filters.availableTo?.slice(0, 10) ?? "");
    setCentralPaymentType(
      (savedSearch.filters.centralDispatch?.paymentTypes?.[0] as CentralPaymentChoice | undefined) ??
        "all"
    );
    setCentralDesiredDeliveryDate(
      savedSearch.filters.centralDispatch?.desiredDeliveryDate ?? ""
    );
    setCentralVehicleSearch(
      savedSearch.filters.centralDispatch?.vehicleYearMakeModel ?? ""
    );
    setCentralOrderIds(savedSearch.filters.centralDispatch?.shipperOrderIds?.join(", ") ?? "");
    setCentralShipperStatus(
      savedSearch.filters.centralDispatch?.shipperStatus ?? "not-blocked"
    );
    setCentralMinimumRating(savedSearch.filters.centralDispatch?.minimumRating ?? "all");
    setCentralTagHours(
      String(savedSearch.filters.centralDispatch?.tagListingsPostedWithinHours ?? 2)
    );
    setCentralShowTaggedOnTop(
      savedSearch.filters.centralDispatch?.showTaggedOnTop ?? true
    );
    setSuperPaymentMethod(
      superPaymentChoiceFromMethods(savedSearch.filters.superDispatch?.paymentMethods)
    );
    setSuperSearchAlongRoute(savedSearch.filters.superDispatch?.searchAlongRoute ?? false);
    setSuperOutOfRouteDistance(
      String(savedSearch.filters.superDispatch?.outOfRouteDistanceMiles ?? 25)
    );
    setSuperShipperMode(savedSearch.filters.superDispatch?.shipperMode ?? "include");
    setSuperShipperNames(savedSearch.filters.superDispatch?.shipperNames?.join(", ") ?? "");
    setSuperCreateLoadAlert(false);
    setShowAdvanced(
      Boolean(
        savedSearch.filters.vehicleCountMin ||
          savedSearch.filters.vehicleCountMax ||
          savedSearch.filters.vehicleTypes?.length ||
          savedSearch.filters.operability ||
          savedSearch.filters.trailerType ||
          savedSearch.filters.postedWithinHours ||
          savedSearch.filters.readyToShipWithinDays ||
          savedSearch.filters.availableFrom ||
          savedSearch.filters.availableTo ||
          savedSearch.filters.centralDispatch ||
          savedSearch.filters.superDispatch
      )
    );
    setSort(filterToSort(savedSearch.filters.sort));
    if (!savedSearch.filters.sources?.length || savedSearch.filters.sources.includes("central-dispatch")) {
      setError("Saved Central Dispatch filters must be confirmed again by selecting the exact autocomplete locations.");
    } else {
      void runSearch(savedSearch.filters);
    }
  }

  function requiresCentralExactLocation(): boolean {
    const centralSelected = source === "central-dispatch" || source === "all";
    return centralSelected && (
      (Boolean(originCity.trim()) && !originLocationSelected) ||
      (Boolean(destinationCity.trim()) && !destinationLocationSelected)
    );
  }

  const centralOnlyResults = Boolean(
    result?.loads.length && result.loads.every((load) => load.source === "central-dispatch")
  );
  const isShowingCachedLoads = Boolean(
    result?.warnings.some((warning) => warning.includes("cached locally"))
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
            Unified feed
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Loads</h1>
          <p className="mt-2 text-sm text-slate-500">
            Live opportunities from all connected load-board sessions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {result ? (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock3 className="h-3.5 w-3.5" /> Updated {formatTime(result.refreshedAt)}
            </span>
          ) : null}
          <Button
            variant="outline"
            onClick={() => void runSearch(activeFilters)}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <StatusBadge tone="info">{result?.total ?? 0} opportunities</StatusBadge>
          {isShowingCachedLoads ? <StatusBadge tone="warning"><WifiOff className="h-3.5 w-3.5" /> Local cache</StatusBadge> : null}
        </div>
      </section>

      {savedSearches.length ? (
        <Card className="flex flex-wrap items-center gap-2 p-4">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Saved searches
          </span>
          {savedSearches.map((savedSearch) => (
            <span
              key={savedSearch.id}
              className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <button
                className="px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-sky-50 hover:text-sky-700"
                onClick={() => applySavedSearch(savedSearch)}
              >
                {savedSearch.name}
              </button>
              <button
                className="border-l border-slate-200 px-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Delete ${savedSearch.name}`}
                onClick={() => void deleteSavedSearch(savedSearch.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </Card>
      ) : null}

      <Card className="p-5">
        <form className="space-y-4" onSubmit={applyFilters}>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)_96px_180px]">
            <LocationAutocomplete
              label="Origin city, ZIP or state"
              value={originCity}
              stateHint={originState}
              placeholder="Atlanta, 30301 or Georgia"
              onValueChange={(value) => {
                setOriginCity(value);
                setOriginResolvedCity("");
                setOriginLocationSelected(false);
                setOriginState("");
                setOriginPostalCode("");
              }}
              onSelect={(selection: LocationSelection) => {
                setOriginCity(
                  selection.city ?? selection.postalCode ?? selection.stateName ?? selection.state ?? ""
                );
                setOriginResolvedCity(selection.city ?? "");
                setOriginState(selection.state ?? "");
                setOriginPostalCode(selection.postalCode ?? "");
                setOriginLocationSelected(true);
              }}
            />
            <FilterField label="Radius">
              <input
                type="number"
                min="1"
                max="1000"
                value={originRadius}
                onChange={(event) => setOriginRadius(event.target.value)}
                className={inputClass}
                aria-label="Origin radius in miles"
              />
            </FilterField>
            <LocationAutocomplete
              label="Destination city, ZIP or state"
              value={destinationCity}
              stateHint={destinationState}
              placeholder="Orlando, 32801 or Florida"
              onValueChange={(value) => {
                setDestinationCity(value);
                setDestinationResolvedCity("");
                setDestinationLocationSelected(false);
                setDestinationState("");
                setDestinationPostalCode("");
              }}
              onSelect={(selection: LocationSelection) => {
                setDestinationCity(
                  selection.city ??
                    selection.postalCode ??
                    selection.stateName ??
                    selection.state ??
                    ""
                );
                setDestinationResolvedCity(selection.city ?? "");
                setDestinationState(selection.state ?? "");
                setDestinationPostalCode(selection.postalCode ?? "");
                setDestinationLocationSelected(true);
              }}
            />
            <FilterField label="Radius">
              <input
                type="number"
                min="1"
                max="1000"
                value={destinationRadius}
                onChange={(event) => setDestinationRadius(event.target.value)}
                className={inputClass}
                aria-label="Destination radius in miles"
              />
            </FilterField>
            <FilterField label="Source">
              <select
                value={source}
                onChange={(event) => setSource(event.target.value as SourceChoice)}
                className={inputClass}
              >
                <option value="all">All sources</option>
                <option value="central-dispatch">Central Dispatch</option>
                <option value="super-dispatch">Super Dispatch</option>
                <option value="ship-cars">Ship.Cars</option>
              </select>
            </FilterField>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[140px_140px_140px_150px_180px_1fr_auto_auto]">
            <FilterField label="Minimum price">
              <input
                type="number"
                min="0"
                step="50"
                value={minimumPrice}
                onChange={(event) => setMinimumPrice(event.target.value)}
                placeholder="$500"
                className={inputClass}
              />
            </FilterField>
            <FilterField label="Maximum price">
              <input
                type="number"
                min="0"
                step="50"
                value={maximumPrice}
                onChange={(event) => setMaximumPrice(event.target.value)}
                placeholder="$2,500"
                className={inputClass}
              />
            </FilterField>
            <FilterField label="Minimum $/mile">
              <input
                type="number"
                min="0"
                step="0.05"
                value={minimumRate}
                onChange={(event) => setMinimumRate(event.target.value)}
                placeholder="$1.25"
                className={inputClass}
              />
            </FilterField>
            <FilterField label="Maximum distance">
              <input
                type="number"
                min="1"
                step="50"
                value={maximumDistance}
                onChange={(event) => setMaximumDistance(event.target.value)}
                placeholder="1,000 mi"
                className={inputClass}
              />
            </FilterField>
            <FilterField label="Sort by">
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortChoice)}
                className={inputClass}
              >
                <option value="newest">Newest first</option>
                <option value="price-desc">Highest price</option>
                <option value="price-asc">Lowest price</option>
                <option value="distance-asc">Shortest distance</option>
              </select>
            </FilterField>
            <FilterField label="Save this search">
              <input
                value={savedSearchName}
                onChange={(event) => setSavedSearchName(event.target.value)}
                placeholder="e.g. Atlanta to Florida"
                className={inputClass}
              />
            </FilterField>
            <Button
              className="mt-auto"
              variant="outline"
              type="button"
              onClick={() => void saveCurrentSearch()}
              disabled={isSaving}
            >
              <Save className="h-4 w-4" /> Save
            </Button>
            <Button className="mt-auto" type="submit" disabled={isLoading}>
              <Search className="h-4 w-4" /> Search
            </Button>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <button
              type="button"
              className="flex items-center gap-2 text-sm font-semibold text-sky-700"
              onClick={() => setShowAdvanced((value) => !value)}
              aria-expanded={showAdvanced}
            >
              <ChevronDown
                className={`h-4 w-4 transition ${showAdvanced ? "rotate-180" : ""}`}
              />
              Advanced synchronized filters
            </button>
            {showAdvanced ? (
              <>
              {source !== "super-dispatch" ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <FilterField label="Minimum vehicles">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={vehicleCountMin}
                    onChange={(event) => setVehicleCountMin(event.target.value)}
                    placeholder="1"
                    className={inputClass}
                  />
                </FilterField>
                <FilterField label="Maximum vehicles">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={vehicleCountMax}
                    onChange={(event) => setVehicleCountMax(event.target.value)}
                    placeholder="9"
                    className={inputClass}
                  />
                </FilterField>
                <FilterField label="Operability">
                  <select
                    value={operability}
                    onChange={(event) =>
                      setOperability(event.target.value as NonNullable<SearchFilters["operability"]>)
                    }
                    className={inputClass}
                  >
                    <option value="all">All vehicles</option>
                    <option value="operable">Operable only</option>
                    <option value="inoperable">Inoperable included</option>
                  </select>
                </FilterField>
                <FilterField label="Trailer type">
                  <select
                    value={trailerType}
                    onChange={(event) =>
                      setTrailerType(event.target.value as NonNullable<SearchFilters["trailerType"]>)
                    }
                    className={inputClass}
                  >
                    <option value="all">All trailers</option>
                    <option value="open">Open</option>
                    <option value="enclosed">Enclosed</option>
                    <option value="driveaway">Driveaway</option>
                  </select>
                </FilterField>
                {source === "central-dispatch" ? (
                  <VehicleTypeMultiSelect value={vehicleTypes} onChange={setVehicleTypes} />
                ) : (
                  <FilterField label="Vehicle types">
                    <input
                      value={vehicleTypes}
                      onChange={(event) => setVehicleTypes(event.target.value)}
                      placeholder="SUV, pickup"
                      className={inputClass}
                    />
                  </FilterField>
                )}
                <FilterField label="Posted within">
                  <select
                    value={postedWithinHours}
                    onChange={(event) => setPostedWithinHours(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Any time</option>
                    <option value="1">Last hour</option>
                    <option value="2">Last 2 hours</option>
                    <option value="6">Last 6 hours</option>
                    <option value="10">Last 10 hours</option>
                    <option value="12">Last 12 hours</option>
                    <option value="20">Last 20 hours</option>
                    <option value="24">Last 24 hours</option>
                    <option value="72">Last 3 days</option>
                    <option value="168">Last 7 days</option>
                  </select>
                </FilterField>
                <FilterField label="Ready to ship within">
                  <select
                    value={readyToShipWithinDays}
                    onChange={(event) => setReadyToShipWithinDays(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Any date</option>
                    <option value="0">Today</option>
                    <option value="1">1 day</option>
                    <option value="2">2 days</option>
                    <option value="3">3 days</option>
                    <option value="4">4 days</option>
                    <option value="5">5 days</option>
                    <option value="6">6 days</option>
                    <option value="7">7 days</option>
                    <option value="10">10 days</option>
                    <option value="14">14 days</option>
                    <option value="30">30 days</option>
                    <option value="60">60 days</option>
                  </select>
                </FilterField>
                <FilterField label="Pickup from">
                  <input
                    type="date"
                    value={pickupFrom}
                    onChange={(event) => setPickupFrom(event.target.value)}
                    className={inputClass}
                  />
                </FilterField>
                <FilterField label="Pickup through">
                  <input
                    type="date"
                    value={pickupTo}
                    onChange={(event) => setPickupTo(event.target.value)}
                    className={inputClass}
                  />
                </FilterField>
                <div className="flex items-end text-xs leading-relaxed text-slate-500">
                  One search is sent to every selected board. Provider-only differences are checked again before results are shown.
                </div>
              </div>
              ) : null}
              {source === "central-dispatch" ? (
                <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 p-4">
                  <div className="mb-4">
                    <p className="text-sm font-bold text-sky-900">Central Dispatch filters</p>
                    <p className="mt-1 text-xs text-sky-700">
                      These values are sent directly to the Central Dispatch session search.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <FilterField label="Payment type">
                      <select
                        value={centralPaymentType}
                        onChange={(event) =>
                          setCentralPaymentType(event.target.value as CentralPaymentChoice)
                        }
                        className={inputClass}
                      >
                        <option value="all">All payment types</option>
                        <option value="LOAD_PAYMENTS">Load Payments</option>
                        <option value="COD_COP">COD/COP</option>
                        <option value="COD_COP_QUICKPAY_COMCHEK">
                          COD/COP/Quickpay/Comchek
                        </option>
                      </select>
                    </FilterField>
                    <FilterField label="Desired delivery date">
                      <input
                        type="date"
                        value={centralDesiredDeliveryDate}
                        onChange={(event) => setCentralDesiredDeliveryDate(event.target.value)}
                        className={inputClass}
                      />
                    </FilterField>
                    <FilterField label="Year / make / model">
                      <input
                        value={centralVehicleSearch}
                        onChange={(event) => setCentralVehicleSearch(event.target.value)}
                        placeholder="2024 Tesla Model Y"
                        className={inputClass}
                      />
                    </FilterField>
                    <FilterField label="Order / Load IDs">
                      <input
                        value={centralOrderIds}
                        onChange={(event) => setCentralOrderIds(event.target.value)}
                        placeholder="123456, 789012"
                        className={inputClass}
                      />
                    </FilterField>
                    <FilterField label="Shipper status">
                      <select
                        value={centralShipperStatus}
                        onChange={(event) =>
                          setCentralShipperStatus(
                            event.target.value as typeof centralShipperStatus
                          )
                        }
                        className={inputClass}
                      >
                        <option value="not-blocked">Not blocked</option>
                        <option value="all">All including blocked</option>
                        <option value="preferred">Preferred only</option>
                      </select>
                    </FilterField>
                    <FilterField label="Minimum shipper rating">
                      <select
                        value={centralMinimumRating}
                        onChange={(event) =>
                          setCentralMinimumRating(
                            event.target.value as typeof centralMinimumRating
                          )
                        }
                        className={inputClass}
                      >
                        <option value="all">All ratings</option>
                        <option value="1">1+ rating</option>
                        <option value="2">2+ rating</option>
                        <option value="3">3+ rating</option>
                        <option value="4">4+ rating</option>
                      </select>
                    </FilterField>
                    <FilterField label="New listing tag hours">
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={centralTagHours}
                        onChange={(event) => setCentralTagHours(event.target.value)}
                        className={inputClass}
                      />
                    </FilterField>
                    <label className="flex h-10 items-center gap-3 self-end rounded-lg border border-sky-200 bg-white px-3 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={centralShowTaggedOnTop}
                        onChange={(event) => setCentralShowTaggedOnTop(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      Show tagged on top
                    </label>
                  </div>
                </div>
              ) : null}
              {source === "super-dispatch" ? (
                <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                  <div className="mb-4">
                    <p className="text-sm font-bold text-violet-900">Super Dispatch · Advanced Search</p>
                    <p className="mt-1 text-xs text-violet-700">
                      Search uses this app's locations, ZIP codes and radii in your saved Super Dispatch session.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <p className="col-span-full pt-1 text-sm font-bold text-violet-900">Vehicle</p>
                    <VehicleTypeMultiSelect
                      value={vehicleTypes}
                      onChange={setVehicleTypes}
                      options={superDispatchVehicleTypeOptions}
                    />
                    <FilterField label="Condition">
                      <select
                        value={operability}
                        onChange={(event) =>
                          setOperability(event.target.value as NonNullable<SearchFilters["operability"]>)
                        }
                        className={inputClass}
                      >
                        <option value="all">All</option>
                        <option value="operable">Operable</option>
                        <option value="inoperable">Inoperable</option>
                      </select>
                    </FilterField>
                    <FilterField label="Transport type">
                      <select
                        value={trailerType}
                        onChange={(event) =>
                          setTrailerType(event.target.value as NonNullable<SearchFilters["trailerType"]>)
                        }
                        className={inputClass}
                      >
                        <option value="all">All</option>
                        <option value="open">Open</option>
                        <option value="enclosed">Enclosed</option>
                        <option value="driveaway">Driveaway</option>
                      </select>
                    </FilterField>
                    <div className="grid grid-cols-2 gap-3">
                      <FilterField label="Min. vehicles">
                        <input type="number" min="1" max="20" value={vehicleCountMin} onChange={(event) => setVehicleCountMin(event.target.value)} className={inputClass} />
                      </FilterField>
                      <FilterField label="Max. vehicles">
                        <input type="number" min="1" max="20" value={vehicleCountMax} onChange={(event) => setVehicleCountMax(event.target.value)} className={inputClass} />
                      </FilterField>
                    </div>
                    <p className="col-span-full pt-2 text-sm font-bold text-violet-900">Payment</p>
                    <FilterField label="Payment options">
                      <select value={superPaymentMethod} onChange={(event) => setSuperPaymentMethod(event.target.value as SuperPaymentChoice)} className={inputClass}>
                        <option value="all">Any payment</option>
                        <option value="cod">COD / COP / CKOD / CKOP</option>
                        <option value="delivery">On delivery / On pickup / 2 business days</option>
                        <option value="billing">Billing</option>
                        <option value="superpay">SuperPay</option>
                      </select>
                    </FilterField>
                    <FilterField label="Min. vehicle price per mi">
                      <input type="number" min="0" step="0.01" value={minimumRate} onChange={(event) => setMinimumRate(event.target.value)} placeholder="$" className={inputClass} />
                    </FilterField>
                    <FilterField label="Min. total price">
                      <input type="number" min="0" step="1" value={minimumPrice} onChange={(event) => setMinimumPrice(event.target.value)} placeholder="$" className={inputClass} />
                    </FilterField>
                    <FilterField label="Ready for pickup">
                      <select value={readyToShipWithinDays} onChange={(event) => setReadyToShipWithinDays(event.target.value)} className={inputClass}>
                        <option value="">Any date</option>
                        <option value="0">Today</option>
                        <option value="1">Within 1 day</option>
                        <option value="3">Within 3 days</option>
                        <option value="7">Within 7 days</option>
                        <option value="14">Within 14 days</option>
                      </select>
                    </FilterField>
                  </div>
                  <div className="mt-4 flex items-center border-t border-violet-200 pt-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-violet-900">
                      <input
                        type="checkbox"
                        checked={superSearchAlongRoute}
                        onChange={(event) => setSuperSearchAlongRoute(event.target.checked)}
                        className="h-4 w-4 rounded border-violet-300 text-violet-600"
                      />
                      Search along route
                    </label>
                    <div className="ml-6 w-48">
                    <FilterField label="Out of route distance">
                      <select
                        value={superOutOfRouteDistance}
                        disabled={!superSearchAlongRoute}
                        onChange={(event) => setSuperOutOfRouteDistance(event.target.value)}
                        className={inputClass}
                      >
                        <option value="10">10 mi</option>
                        <option value="25">25 mi</option>
                        <option value="50">50 mi</option>
                        <option value="75">75 mi</option>
                        <option value="100">100 mi</option>
                      </select>
                    </FilterField>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 border-t border-violet-200 pt-4 md:grid-cols-[auto_1fr]">
                    <div>
                      <p className="mb-2 text-sm font-semibold text-violet-900">Shippers</p>
                      <label className="mr-4 inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="super-shipper-mode"
                          checked={superShipperMode === "include"}
                          onChange={() => setSuperShipperMode("include")}
                        />
                        Include
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="super-shipper-mode"
                          checked={superShipperMode === "exclude"}
                          onChange={() => setSuperShipperMode("exclude")}
                        />
                        Exclude
                      </label>
                    </div>
                    <FilterField label="Shipper names">
                      <input
                        value={superShipperNames}
                        onChange={(event) => setSuperShipperNames(event.target.value)}
                        placeholder="All shippers, or names separated by commas"
                        className={inputClass}
                      />
                    </FilterField>
                  </div>
                  <label className="mt-4 flex items-center justify-between rounded-lg border border-violet-200 bg-white px-3 py-3 text-sm font-semibold text-violet-900">
                    Create Load Alert
                    <input
                      type="checkbox"
                      checked={superCreateLoadAlert}
                      onChange={(event) => setSuperCreateLoadAlert(event.target.checked)}
                      className="h-5 w-5 rounded border-violet-300 text-violet-600"
                    />
                  </label>
                </div>
              ) : null}
              </>
            ) : null}
          </div>
        </form>
      </Card>

      {result ? (
        <div className="flex flex-wrap gap-2">
          {Object.entries(result.sourceCounts).map(([boardId, count]) => (
            <StatusBadge key={boardId} tone="neutral">
              {formatSource(boardId as LoadBoardId)}: {count}
            </StatusBadge>
          ))}
          {result.duplicatesRemoved > 0 ? (
            <StatusBadge tone="info">
              <Layers3 className="h-3.5 w-3.5" /> {result.duplicatesRemoved} duplicates merged
            </StatusBadge>
          ) : null}
        </div>
      ) : null}

      {result?.warnings.map((warning) => {
        const isCacheWarning = warning.includes("cached locally");
        return (
        <div
          key={warning}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${isCacheWarning ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-100 bg-sky-50 text-sky-800"}`}
        >
          {isCacheWarning ? <WifiOff className="mt-0.5 h-4 w-4 shrink-0" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />}
          {warning}
        </div>
      );
      })}

      {error ? (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">{error}</Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="font-bold text-slate-900">Available opportunities</h2>
            <p className="mt-1 text-sm text-slate-500">
              Normalized data with source attribution and strong-match deduplication.
            </p>
          </div>
          <Filter className="h-4 w-4 text-slate-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className={centralOnlyResults ? "hidden" : "bg-slate-50 text-xs uppercase tracking-wide text-slate-500"}>
              <tr>
                <th className="px-6 py-3 font-semibold">Route</th>
                <th className="px-5 py-3 font-semibold">Vehicle(s)</th>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-5 py-3 font-semibold">Distance</th>
                <th className="px-5 py-3 text-right font-semibold">Price</th>
                <th className="w-14 px-3 py-3"><span className="sr-only">Details</span></th>
              </tr>
            </thead>
            <tbody className={centralOnlyResults ? "bg-slate-50" : "divide-y divide-slate-100"}>
              {isLoading ? (
                <tr>
                  <td className="px-6 py-10 text-slate-500" colSpan={6}>
                    Refreshing connected sources…
                  </td>
                </tr>
              ) : null}
              {!isLoading && result?.loads.map((load) => (
                <LoadRow
                  key={load.id}
                  load={load}
                  tagHours={normalizeTagHours(centralTagHours)}
                  onViewRoute={() => setRouteLoad(load)}
                />
              ))}
              {!isLoading && !result?.loads.length ? (
                <tr>
                  <td className="px-6 py-10 text-slate-500" colSpan={6}>
                    No loads match those filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      {routeLoad ? (
        <RouteMapBrowser
          origin={routeLoad.pickup.location}
          destination={routeLoad.delivery.location}
          onClose={() => setRouteLoad(undefined)}
        />
      ) : null}
    </div>
  );
}

function FilterField({ label, icon = false, children }: { label: string; icon?: boolean; children: ReactNode }): JSX.Element {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
      {label}
      <span className="relative">
        {icon ? (
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        ) : null}
        {children}
      </span>
    </label>
  );
}

function VehicleTypeMultiSelect({
  value,
  onChange,
  options = centralVehicleTypeOptions
}: {
  value: string;
  onChange: (value: string) => void;
  options?: ReadonlyArray<{ value: string; label: string }>;
}): JSX.Element {
  const selected = new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const selectedLabels = options
    .filter((option) => selected.has(option.value))
    .map((option) => option.label);
  const summary =
    selectedLabels.length === 0
      ? "All vehicle types"
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.length} types selected`;

  function toggle(valueToToggle: string): void {
    if (selected.has(valueToToggle)) selected.delete(valueToToggle);
    else selected.add(valueToToggle);

    const orderedValues = options
      .filter((option) => selected.has(option.value))
      .map((option) => option.value);
    onChange(orderedValues.join(", "));
  }

  return (
    <div className="grid gap-1.5 text-xs font-semibold text-slate-600">
      Vehicle type
      <details className="group relative">
        <summary className={`${inputClass} flex cursor-pointer list-none items-center justify-between gap-2`}>
          <span className={selectedLabels.length ? "truncate text-slate-800" : "truncate text-slate-500"}>
            {summary}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[340px] rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
          <div className="grid grid-cols-2 gap-x-5 gap-y-1">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-sky-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(option.value)}
                  onChange={() => toggle(option.value)}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                {option.label}
              </label>
            ))}
          </div>
          {selectedLabels.length ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="mt-2 w-full border-t border-slate-100 pt-3 text-left text-xs font-semibold text-sky-700 hover:text-sky-900"
            >
              Clear selection
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function LoadRow(props: { load: Load; tagHours: number; onViewRoute: () => void }): JSX.Element {
  return <UnifiedLoadRow {...props} />;
}

function UnifiedLoadRow({
  load,
  tagHours,
  onViewRoute
}: {
  load: Load;
  tagHours: number;
  onViewRoute: () => void;
}): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const newPostingTag = getNewPostingTag(load, tagHours);
  const vehicle = load.vehicles[0];
  const company = load.details?.company;
  const payment = load.details?.payment;
  const pickup = formatFullLocation(load.pickup.location);
  const delivery = formatFullLocation(load.delivery.location);
  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
    : "Vehicle details pending";
  const isPrimaryVehicleInoperable = vehicle?.operable === false;
  const extraVehicles = Math.max(0, load.vehicles.length - 1);
  const rating = company?.overallRating ?? company?.rating;
  const ratingCount = company?.overallRatingCount ?? company?.ratingCount;
  const paymentTerms = formatPayment(
    payment?.codAmountCents,
    payment?.codMethod,
    payment?.codLocation
  );
  const canViewRoute = hasRouteLocation(load.pickup.location) && hasRouteLocation(load.delivery.location);

  return (
    <>
      <tr>
        <td colSpan={6} className="p-2">
          <div
            className={`grid min-w-[1050px] gap-5 rounded-sm border bg-white px-4 py-4 transition xl:grid-cols-[170px_minmax(165px,1fr)_minmax(175px,1.1fr)_minmax(185px,1.1fr)_150px_42px] ${
              isExpanded
                ? "border-sky-600 shadow-sm"
                : "border-slate-300 hover:border-sky-300 hover:shadow-sm"
            }`}
          >
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1 text-[9px] font-extrabold uppercase tracking-wide">
                <StatusBadge tone="neutral">{formatSource(load.source)}</StatusBadge>
                {newPostingTag ? (
                  <>
                    <span className="rounded-sm bg-sky-600 px-2 py-1 text-white">New</span>
                  <span className="rounded-sm bg-amber-300 px-2 py-1 text-amber-950">
                    {newPostingTag}
                  </span>
                  </>
                ) : null}
              </div>
              <p className="text-2xl font-black tracking-tight text-slate-950">
                {formatMoney(load.price?.amountCents)}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-slate-600">
                {load.distanceMiles?.toLocaleString() ?? "—"} mi @ {formatRate(load.ratePerMileCents)}
              </p>
              <p className="mt-1 text-xs text-slate-700">{paymentTerms ?? "Payment terms pending"}</p>
            </div>

            <CentralRowColumn title="Vehicle info">
              <p
                className={`truncate font-bold ${isPrimaryVehicleInoperable ? "text-rose-600" : "text-slate-900"}`}
                title={vehicleName}
              >
                {vehicleName}
              </p>
              {extraVehicles ? <p className="mt-1 font-semibold text-sky-700">+ {extraVehicles} more</p> : null}
              <p className="mt-1">{vehicle?.vehicleType ?? "Vehicle type pending"}</p>
              <p className="mt-1">
                {[vehicle?.quantity ? `${vehicle.quantity} vehicle${vehicle.quantity === 1 ? "" : "s"}` : undefined, formatDimensions(vehicle?.dimensions)]
                  .filter(Boolean)
                  .join(" · ") || "Specifications pending"}
              </p>
            </CentralRowColumn>

            <CentralRowColumn title="Company">
              <p className="truncate font-bold text-sky-800" title={company?.name}>{company?.name ?? "Company pending"}</p>
              <p className="mt-1">
                {rating !== undefined
                  ? `★ ${rating.toFixed(1)}${ratingCount !== undefined ? ` (${ratingCount.toLocaleString()})` : ""}`
                  : "Rating pending"}
              </p>
              <p className="mt-1">{[company?.hours, company?.timeZone].filter(Boolean).join(" · ") || "Hours pending"}</p>
              <p className="mt-1 font-semibold text-sky-700">{company?.phone ?? ""}</p>
            </CentralRowColumn>

            <CentralRowColumn title="Pick-up location">
              <p className="font-bold text-sky-800">{pickup}</p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Delivery location</p>
              <p className="mt-1 font-bold text-sky-800">{delivery}</p>
              {canViewRoute ? (
                <button
                  type="button"
                  onClick={onViewRoute}
                  className="mt-1.5 text-xs font-extrabold text-sky-700 transition hover:text-sky-900"
                >
                  View Route
                </button>
              ) : null}
            </CentralRowColumn>

            <CentralRowColumn title="Pick-up on or after">
              <p className="font-bold text-slate-900">{formatDetailDate(load.pickup.availableFrom)}</p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Desired delivery date</p>
              <p className="mt-1 font-semibold text-slate-800">
                {formatDetailDate(load.details?.desiredDeliveryDate ?? load.delivery.availableTo)}
              </p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Posted date</p>
              <p className="mt-1 font-semibold text-slate-800">{formatDetailDate(load.postedAt)}</p>
            </CentralRowColumn>

            <div className="flex items-center justify-center">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sky-400 text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-300"
                onClick={() => setIsExpanded((expanded) => !expanded)}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? "Collapse load details" : "Expand load details"}
                title={isExpanded ? "Collapse details" : "View load details"}
              >
                <ChevronDown className={`h-5 w-5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>
            </div>
          </div>
        </td>
      </tr>
      {isExpanded ? (
        <tr>
          <td className="p-2 pt-0" colSpan={6}>
            <LoadDetailsPanel load={load} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function CentralRowColumn({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="min-w-0 text-xs leading-snug text-slate-600">
      <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function LoadDetailsPanel({ load }: { load: Load }): JSX.Element {
  const [activeTab, setActiveTab] = useState<"general" | "vehicles" | "super-dispatch">("general");
  const vehicle = load.vehicles[0];
  const company = load.details?.company;
  const payment = load.details?.payment;
  const pickup = formatFullLocation(load.pickup.location);
  const delivery = formatFullLocation(load.delivery.location);
  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
    : "Vehicle details pending";
  const rating = company?.overallRating ?? company?.rating;
  const ratingCount = company?.overallRatingCount ?? company?.ratingCount;

  return (
    <div className="border-y-2 border-sky-600 bg-white shadow-inner">
      <div className="flex border-b border-slate-200 px-6 pt-4" role="tablist" aria-label="Load details">
        <LoadDetailTab
          active={activeTab === "general"}
          label="General info"
          onClick={() => setActiveTab("general")}
        />
        <LoadDetailTab
          active={activeTab === "vehicles"}
          label={`Vehicle info (${load.vehicles.length})`}
          onClick={() => setActiveTab("vehicles")}
        />
        {load.source === "super-dispatch" ? (
          <LoadDetailTab
            active={activeTab === "super-dispatch"}
            label="Super Dispatch"
            onClick={() => setActiveTab("super-dispatch")}
          />
        ) : null}
      </div>

      {activeTab === "general" ? (
        <div className="grid gap-x-8 gap-y-7 px-6 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <DetailSection title="Vehicle info">
          <DetailValue label="Vehicle" value={vehicleName} />
          <DetailValue label="Vehicle type" value={vehicle?.vehicleType} />
          <DetailValue label="Quantity" value={vehicle?.quantity?.toString()} />
          <DetailValue label="Condition" value={vehicle?.operable === undefined ? undefined : vehicle.operable ? "Operable" : "Inoperable"} />
          <DetailValue label="Weight" value={vehicle?.weightPounds ? `${vehicle.weightPounds.toLocaleString()} lbs` : undefined} />
          <DetailValue label="Dimensions" value={formatDimensions(vehicle?.dimensions)} />
          <DetailValue label="Issues" value={vehicle?.issues?.join(", ")} emphasis={Boolean(vehicle?.issues?.length)} />
        </DetailSection>

        <DetailSection title="Job info">
          <DetailValue label="Pick-up location" value={pickup} emphasis />
          <DetailValue label="Delivery location" value={delivery} emphasis />
          <DetailValue label="Price" value={`${formatMoney(load.price?.amountCents)} · ${load.distanceMiles?.toLocaleString() ?? "—"} mi @ ${formatRate(load.ratePerMileCents)}`} />
          <DetailValue label="Shipper order ID" value={load.details?.shipperOrderId} />
        </DetailSection>

        <DetailSection title="Dates">
          <DetailValue label="Pick-up on or after" value={formatDetailDate(load.pickup.availableFrom)} />
          <DetailValue label="Desired delivery date" value={formatDetailDate(load.details?.desiredDeliveryDate ?? load.delivery.availableTo)} />
          <DetailValue label="Posted date" value={formatDetailDate(load.postedAt)} />
        </DetailSection>

        <DetailSection title="Company info">
          <DetailValue label="Company name" value={company?.name} emphasis />
          <DetailValue label="Phone number" value={company?.phone} emphasis />
          <DetailValue label="Email" value={company?.email} />
          <DetailValue label="Contact" value={company?.contactName} />
          <DetailValue label="Hours" value={[company?.hours, company?.timeZone].filter(Boolean).join(" ")} />
          <DetailValue label="Rating" value={rating !== undefined ? `${rating.toFixed(1)} ★${ratingCount !== undefined ? ` (${ratingCount.toLocaleString()})` : ""}` : undefined} />
          <DetailValue label="Shipper type" value={company?.tier} />
          <DetailValue label="Verification" value={formatCode(company?.verificationStatus)} />
        </DetailSection>

        <DetailSection title="Misc">
          <DetailValue label="COD" value={formatPayment(payment?.codAmountCents, payment?.codMethod, payment?.codLocation)} />
          <DetailValue label="Balance" value={formatPayment(payment?.balanceAmountCents, payment?.balancePaymentMethod, payment?.balancePaymentTime)} />
          <DetailValue label="Payment processing" value={formatCode(payment?.processingMethod)} />
          <DetailValue label="Payment method" value={formatCode(payment?.method)} />
          <DetailValue label="Payment terms" value={formatCode(payment?.terms)} />
          <DetailValue label="Load-specific terms" value={load.details?.additionalInfo} />
          <DetailValue label="Pre-dispatch notes" value={load.details?.preDispatchNotes} />
          <DetailValue label="Inspection" value={formatBoolean(load.details?.requiresInspection, "Required", "Not required")} />
          <DetailValue label="TWIC" value={formatBoolean(load.details?.twicRequired, "Required", "Not required")} />
        </DetailSection>
        </div>
      ) : activeTab === "vehicles" ? (
        <VehicleInfoTab load={load} />
      ) : (
        <SuperDispatchInfoTab load={load} />
      )}
    </div>
  );
}

function LoadDetailTab({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`border-b-[3px] px-3 pb-3 text-xs font-extrabold uppercase tracking-wide transition ${
        active
          ? "border-sky-700 text-slate-950"
          : "border-transparent text-sky-700 hover:border-sky-200 hover:text-sky-900"
      }`}
    >
      {label}
    </button>
  );
}

function SuperDispatchInfoTab({ load }: { load: Load }): JSX.Element {
  const company = load.details?.company;
  const payment = load.details?.payment;
  const access = load.details?.carrierAccess;
  const rating = company?.overallRating ?? company?.rating;
  const ratingCount = company?.overallRatingCount ?? company?.ratingCount;

  return (
    <section className="space-y-6 px-6 py-6">
      <div className="grid gap-x-8 gap-y-7 md:grid-cols-2 xl:grid-cols-3">
        <DetailSection title="Shipper">
          <DetailValue label="Company" value={company?.name} emphasis />
          <DetailValue label="Contact" value={company?.contactName} />
          <DetailValue label="Phone" value={company?.phone} emphasis />
          <DetailValue label="Email" value={company?.email} />
          <DetailValue label="Verification" value={formatCode(company?.verificationStatus)} />
          <DetailValue
            label="Rating"
            value={
              rating !== undefined
                ? `${rating.toFixed(1)} ★${ratingCount !== undefined ? ` (${ratingCount.toLocaleString()})` : ""}`
                : undefined
            }
          />
          <DetailValue
            label="Vehicles moved"
            value={company?.movedVehiclesCount?.toLocaleString()}
          />
        </DetailSection>

        <DetailSection title="Payment & access">
          <DetailValue label="Carrier pay" value={formatMoney(load.price?.amountCents)} emphasis />
          <DetailValue label="Payment method" value={formatCode(payment?.method)} />
          <DetailValue label="Payment terms" value={formatCode(payment?.terms)} />
          <DetailValue label="Can book" value={formatBoolean(access?.canBook, "Available", "Not available")} />
          <DetailValue label="Can request" value={formatBoolean(access?.canRequest, "Available", "Not available")} />
          <DetailValue label="Certificate required" value={formatBoolean(access?.certificateRequired, "Required", "Not required")} />
          <DetailValue label="ACH payment required" value={formatBoolean(access?.achPaymentRequired, "Required", "Not required")} />
        </DetailSection>

        <DetailSection title="Pick-up & delivery">
          <DetailValue label="Pick-up venue" value={formatCode(load.pickup.locationType)} />
          <DetailValue label="Pick-up metro area" value={load.pickup.location.metroArea} />
          <DetailValue label="Pick-up date type" value={formatCode(load.details?.pickupDateType)} />
          <DetailValue label="Pick-up hours" value={formatCode(load.details?.pickupBusinessHoursType)} />
          <DetailValue label="Delivery venue" value={formatCode(load.delivery.locationType)} />
          <DetailValue label="Delivery metro area" value={load.delivery.location.metroArea} />
          <DetailValue label="Delivery date type" value={formatCode(load.details?.deliveryDateType)} />
          <DetailValue label="Delivery hours" value={formatCode(load.details?.deliveryBusinessHoursType)} />
        </DetailSection>
      </div>

      {load.details?.additionalInfo ? (
        <SuperDispatchNote title="Load instructions">{load.details.additionalInfo}</SuperDispatchNote>
      ) : null}
      {load.details?.preDispatchNotes ? (
        <SuperDispatchNote title="Carrier requirements">{load.details.preDispatchNotes}</SuperDispatchNote>
      ) : null}
    </section>
  );
}

function SuperDispatchNote({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <h3 className="text-xs font-extrabold uppercase tracking-wide text-sky-900">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{children}</p>
    </section>
  );
}

function VehicleInfoTab({ load }: { load: Load }): JSX.Element {
  return (
    <section className="px-6 py-6">
      <h3 className="text-xs font-extrabold uppercase tracking-wide text-sky-900">
        {load.vehicles.length} total vehicle{load.vehicles.length === 1 ? "" : "s"}
      </h3>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <div className="min-w-[820px] divide-y divide-slate-200">
          {load.vehicles.map((vehicle, index) => {
            const vehicleName = [vehicle.year, vehicle.make, vehicle.model]
              .filter(Boolean)
              .join(" ");
            return (
              <div
                key={`${vehicle.vin ?? vehicleName}-${index}`}
                className="grid grid-cols-[1.45fr_.7fr_1.45fr_.8fr_.65fr] gap-5 px-4 py-3 text-xs"
              >
                <VehicleInfoValue
                  label="Vehicle"
                  value={vehicleName || `Vehicle ${index + 1}`}
                  detail={vehicle.vehicleType}
                />
                <VehicleInfoValue
                  label="Weight"
                  value={
                    vehicle.weightPounds !== undefined
                      ? `${vehicle.weightPounds.toLocaleString()} lbs`
                      : "Unspecified"
                  }
                />
                <VehicleInfoValue
                  label="Dimensions"
                  value={formatDimensions(vehicle.dimensions) ?? "Unspecified"}
                />
                <VehicleInfoValue label="Trailer required" value={formatCode(load.trailerType) ?? "Unspecified"} />
                <VehicleInfoValue label="Price check" value="Available" emphasis />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function VehicleInfoValue({
  label,
  value,
  detail,
  emphasis = false
}: {
  label: string;
  value: string;
  detail?: string;
  emphasis?: boolean;
}): JSX.Element {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 truncate font-semibold ${emphasis ? "text-sky-700" : "text-slate-900"}`} title={value}>
        {value}
      </p>
      {detail ? <p className="mt-0.5 truncate text-slate-500">{detail}</p> : null}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="min-w-0">
      <h3 className="mb-4 text-xs font-extrabold uppercase tracking-wide text-sky-900">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function DetailValue({ label, value, emphasis = false }: { label: string; value?: string; emphasis?: boolean }): JSX.Element | null {
  if (!isMeaningfulDetail(value)) return null;
  return (
    <div className="min-w-0 text-xs">
      <p className="text-slate-500">{label}</p>
      <p className={`mt-0.5 break-words font-semibold ${emphasis ? "text-sky-800" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function isMeaningfulDetail(value?: string): value is string {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && !["—", "-", "unspecified", "n/a", "pending"].includes(normalized));
}

function paymentMethodsForSuperChoice(
  choice: SuperPaymentChoice
): NonNullable<NonNullable<SearchFilters["superDispatch"]>["paymentMethods"]> {
  if (choice === "cod") return ["cash", "check", "cashiers_check", "comchek"];
  if (choice === "delivery") return ["cash", "check", "cashiers_check"];
  if (choice === "billing") return ["ach", "direct_deposit", "credit_card"];
  if (choice === "superpay") return ["superpay"];
  return [];
}

function superPaymentChoiceFromMethods(
  methods?: NonNullable<NonNullable<SearchFilters["superDispatch"]>["paymentMethods"]>
): SuperPaymentChoice {
  if (!methods?.length) return "all";
  if (methods.includes("superpay")) return "superpay";
  if (methods.some((method) => ["ach", "direct_deposit", "credit_card"].includes(method))) {
    return "billing";
  }
  if (methods.includes("comchek")) return "cod";
  return "delivery";
}

function sortToFilter(sort: SortChoice): NonNullable<SearchFilters["sort"]> {
  if (sort === "price-desc") return { field: "price", direction: "desc" };
  if (sort === "price-asc") return { field: "price", direction: "asc" };
  if (sort === "distance-asc") return { field: "distanceMiles", direction: "asc" };
  return { field: "postedAt", direction: "desc" };
}

function filterToSort(sort?: SearchFilters["sort"]): SortChoice {
  if (sort?.field === "price" && sort.direction === "desc") return "price-desc";
  if (sort?.field === "price" && sort.direction === "asc") return "price-asc";
  if (sort?.field === "distanceMiles" && sort.direction === "asc") return "distance-asc";
  return "newest";
}

function normalizeTagHours(value: string): number {
  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 ? Math.min(24, Math.round(hours)) : 2;
}

function getNewPostingTag(load: Load, tagHours: number): string | undefined {
  if (load.source !== "central-dispatch" || !load.postedAt) return undefined;
  const postedAt = Date.parse(load.postedAt);
  if (!Number.isFinite(postedAt)) return undefined;

  const ageMilliseconds = Math.max(0, Date.now() - postedAt);
  const ageHours = Math.max(1, Math.ceil(ageMilliseconds / (60 * 60 * 1_000)));
  if (ageHours > tagHours) return undefined;

  return `Posted ${ageHours} ${ageHours === 1 ? "Hour" : "Hours"} Ago`;
}

function formatSource(source: LoadBoardId): string {
  return {
    "central-dispatch": "Central Dispatch",
    "super-dispatch": "Super Dispatch",
    "ship-cars": "Ship.Cars"
  }[source];
}

function formatFullLocation(location: Load["pickup"]["location"]): string {
  return [location.city, location.state, location.postalCode].filter(Boolean).join(", ") || "—";
}

function hasRouteLocation(location: Load["pickup"]["location"]): boolean {
  return (
    (location.latitude !== undefined && location.longitude !== undefined) ||
    Boolean(location.city || location.state || location.postalCode)
  );
}

function formatDimensions(dimensions?: Load["vehicles"][number]["dimensions"]): string | undefined {
  if (!dimensions) return undefined;
  const parts = [
    dimensions.lengthInches !== undefined ? `${dimensions.lengthInches}" L` : undefined,
    dimensions.widthInches !== undefined ? `${dimensions.widthInches}" W` : undefined,
    dimensions.heightInches !== undefined ? `${dimensions.heightInches}" H` : undefined
  ].filter(Boolean);
  return parts.length ? parts.join(" × ") : undefined;
}

function formatDetailDate(date?: string): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit"
  }).format(parsed);
}

function formatCode(value?: string): string | undefined {
  if (!value) return undefined;
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPayment(amountCents?: number, method?: string, timing?: string): string | undefined {
  const parts = [
    amountCents !== undefined ? formatMoney(amountCents) : undefined,
    formatCode(method),
    formatCode(timing)
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function formatBoolean(value: boolean | undefined, yes: string, no: string): string | undefined {
  if (value === undefined) return undefined;
  return value ? yes : no;
}

function formatMoney(cents?: number): string {
  if (cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100
  );
}

function formatRate(cents?: number): string {
  if (cents === undefined) return "Rate pending";
  return `$${(cents / 100).toFixed(2)}/mi`;
}

function formatTime(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(date));
}
