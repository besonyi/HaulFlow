import {
  Activity,
  ArrowRight,
  Filter,
  Focus,
  LoaderCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Load } from "@shared/types/load";
import type { LoadBoardId } from "@shared/types/load-board";
import type { LocationSelection } from "@shared/types/location-search";
import type { SearchFilters } from "@shared/types/search-filters";
import { desktopApi } from "@/api/client";
import { LoadInspector } from "@/components/load-inspector";
import { LocationAutocomplete } from "@/components/location-autocomplete";
import { RouteMapBrowser } from "@/components/route-map-browser";
import { SourceBadges, SourceBadge, sourceLabel } from "@/components/ui/source-badge";
import { useLoadWorkspace } from "@/components/workspace/load-workspace";

const sources: LoadBoardId[] = ["central-dispatch", "super-dispatch", "ship-cars"];
type SortField = "postedAt" | "price" | "distanceMiles";

export function SearchPage(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useLoadWorkspace();
  const { runSearch, result: existingResult } = workspace;
  const [originValue, setOriginValue] = useState("");
  const [destinationValue, setDestinationValue] = useState("");
  const [originSelections, setOriginSelections] = useState<LocationSelection[]>([]);
  const [destinationSelections, setDestinationSelections] = useState<LocationSelection[]>([]);
  const [radius, setRadius] = useState("100");
  const [vehicleMin, setVehicleMin] = useState("");
  const [vehicleMax, setVehicleMax] = useState("");
  const [minimumRate, setMinimumRate] = useState("");
  const [availableDate, setAvailableDate] = useState("");
  const [selectedSources, setSelectedSources] = useState<LoadBoardId[]>(sources);
  const [sort, setSort] = useState<SortField>("postedAt");
  const [focusMode, setFocusMode] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [routeLoad, setRouteLoad] = useState<Load>();
  const [savedLoadIds, setSavedLoadIds] = useState<Set<string>>(new Set());
  const [isSavingLoad, setIsSavingLoad] = useState(false);

  const activeFilters = useMemo(
    () => buildFilters({ originValue, destinationValue, originSelections, destinationSelections, radius, vehicleMin, vehicleMax, minimumRate, availableDate, selectedSources, sort }),
    [availableDate, destinationSelections, destinationValue, minimumRate, originSelections, originValue, radius, selectedSources, sort, vehicleMax, vehicleMin]
  );

  useEffect(() => {
    if (!existingResult) void runSearch({ sources, statuses: ["available"], sort: { field: "postedAt", direction: "desc" } });
  }, [existingResult, runSearch]); // A useful real feed is visible immediately; later searches use the same shared workspace.

  useEffect(() => {
    const filters = workspace.appliedFilters;
    if (!filters) return;
    setSelectedSources(filters.sources?.length ? filters.sources : sources);
    setRadius(String(filters.origin?.radiusMiles ?? filters.destination?.radiusMiles ?? 100));
    setVehicleMin(filters.vehicleCountMin ? String(filters.vehicleCountMin) : "");
    setVehicleMax(filters.vehicleCountMax ? String(filters.vehicleCountMax) : "");
    setMinimumRate(filters.minRatePerMileCents ? String(filters.minRatePerMileCents / 100) : "");
    setAvailableDate(filters.availableFrom?.slice(0, 10) ?? "");
    setSort(filters.sort?.field ?? "postedAt");
    const nextOrigins = selectionsFromFilter(filters.origin);
    const nextDestinations = selectionsFromFilter(filters.destination);
    setOriginSelections(nextOrigins);
    setDestinationSelections(nextDestinations);
    setOriginValue(nextOrigins.length ? "" : filters.origin?.cities?.[0] ?? "");
    setDestinationValue(nextDestinations.length ? "" : filters.destination?.cities?.[0] ?? "");
  }, [workspace.appliedFilters]);

  useEffect(() => {
    const universalQuery = searchParams.get("q")?.trim();
    if (!universalQuery) return;
    setOriginValue(universalQuery);
    setOriginSelections([]);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let active = true;
    void desktopApi.loads.listSavedLoads()
      .then((saved) => { if (active) setSavedLoadIds(new Set(saved.map((item) => item.id))); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  function toggleSource(source: LoadBoardId): void {
    setSelectedSources((current) => current.includes(source) ? current.filter((id) => id !== source) : [...current, source]);
  }

  function applySearch(): void {
    setLocalError(undefined);
    if (!selectedSources.length) {
      setLocalError("Choose at least one live source.");
      return;
    }
    const requiresCentralChoice = selectedSources.includes("central-dispatch") &&
      (Boolean(originValue.trim()) || Boolean(destinationValue.trim()));
    if (requiresCentralChoice) {
      const message = "Central Dispatch needs the exact city from autocomplete before this filter can be applied.";
      workspace.markCentralAwaitingSelection(message);
      setLocalError(message);
      return;
    }
    void workspace.runSearch(activeFilters);
  }

  async function saveLoad(load: Load): Promise<void> {
    setIsSavingLoad(true);
    setLocalError(undefined);
    try {
      await desktopApi.loads.saveLoad({ load });
      setSavedLoadIds((current) => new Set(current).add(load.id));
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : "Could not save this load.");
    } finally {
      setIsSavingLoad(false);
    }
  }

  async function removeSavedLoad(load: Load): Promise<void> {
    setIsSavingLoad(true);
    setLocalError(undefined);
    try {
      await desktopApi.loads.deleteSavedLoad(load.id);
      setSavedLoadIds((current) => {
        const next = new Set(current);
        next.delete(load.id);
        return next;
      });
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : "Could not remove this saved load.");
    } finally {
      setIsSavingLoad(false);
    }
  }

  const total = workspace.result?.total ?? 0;
  const error = localError ?? workspace.error;

  return (
    <div className={focusMode ? "space-y-4 pb-5" : "space-y-5 pb-5"}>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300"><Activity className="h-3.5 w-3.5" />Live load workspace</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Search every board as one feed.</h1>
          <p className="mt-1 text-sm text-slate-400">One filter revision, three isolated provider sessions, deduplicated results.</p>
        </div>
        <button type="button" onClick={() => setFocusMode((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white"><Focus className="h-3.5 w-3.5" />{focusMode ? "Exit focus" : "Focus mode"}</button>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#101318] p-3 shadow-2xl shadow-black/20">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_118px_auto]">
          <div className="rounded-lg border border-white/10 bg-[#0c0e12] px-3 py-2">
            <LocationAutocomplete label="Origin" value={originValue} stateHint={originSelections.at(-1)?.state} placeholder="Add city, state or ZIP" onValueChange={setOriginValue} onSelect={(selection) => { setOriginSelections((current) => appendLocation(current, selection)); setOriginValue(""); }} />
            <LocationPills selections={originSelections} onRemove={(selection) => setOriginSelections((current) => current.filter((item) => locationKey(item) !== locationKey(selection)))} />
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0c0e12] px-3 py-2">
            <LocationAutocomplete label="Delivery" value={destinationValue} stateHint={destinationSelections.at(-1)?.state} placeholder="Add city, state or ZIP" onValueChange={setDestinationValue} onSelect={(selection) => { setDestinationSelections((current) => appendLocation(current, selection)); setDestinationValue(""); }} />
            <LocationPills selections={destinationSelections} onRemove={(selection) => setDestinationSelections((current) => current.filter((item) => locationKey(item) !== locationKey(selection)))} />
          </div>
          <label className="grid gap-1 text-xs font-semibold text-slate-400">Radius<input value={radius} onChange={(event) => setRadius(event.target.value)} inputMode="numeric" className="h-10 rounded-md border border-white/10 bg-[#0c0e12] px-3 text-sm text-white outline-none transition focus:border-cyan-400/60" /></label>
          <button type="button" disabled={workspace.isSearching} onClick={applySearch} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50">{workspace.isSearching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Search</button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          {sources.map((source) => {
            const selected = selectedSources.includes(source);
            const status = workspace.filterSync[source];
            return <button key={source} type="button" onClick={() => toggleSource(source)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selected ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100" : "border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300"}`}><span className={`h-1.5 w-1.5 rounded-full ${status.phase === "synced" ? "bg-emerald-400" : status.phase === "failed" || status.phase === "awaiting-selection" ? "bg-amber-400" : status.phase === "syncing" ? "bg-cyan-300 animate-pulse" : "bg-slate-600"}`} /><SourceBadge source={source} compact />{sourceLabel(source)}</button>;
          })}
          <button type="button" onClick={() => setShowMore((value) => !value)} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"><SlidersHorizontal className="h-3.5 w-3.5" />{showMore ? "Fewer filters" : "More filters"}</button>
        </div>

        {showMore ? <div className="mt-3 grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Min $ / mile"><input value={minimumRate} onChange={(event) => setMinimumRate(event.target.value)} inputMode="decimal" placeholder="e.g. 3.00" className={inputClass} /></Field>
          <Field label="Vehicles"><div className="grid grid-cols-2 gap-2"><input value={vehicleMin} onChange={(event) => setVehicleMin(event.target.value)} inputMode="numeric" placeholder="Min" className={inputClass} /><input value={vehicleMax} onChange={(event) => setVehicleMax(event.target.value)} inputMode="numeric" placeholder="Max" className={inputClass} /></div></Field>
          <Field label="Pickup from"><input value={availableDate} onChange={(event) => setAvailableDate(event.target.value)} type="date" className={inputClass} /></Field>
          <Field label="Sort"><select value={sort} onChange={(event) => setSort(event.target.value as SortField)} className={inputClass}><option value="postedAt">Newest first</option><option value="price">Highest pay</option><option value="distanceMiles">Shortest trip</option></select></Field>
        </div> : null}

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
          {filterChips(activeFilters).map((chip) => <span key={chip} className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1"><Filter className="h-3 w-3 text-cyan-300" />{chip}</span>)}
          {selectedSources.includes("central-dispatch") && (originValue || destinationValue || originSelections.length || destinationSelections.length) ? <span className={`inline-flex items-center rounded-full px-2.5 py-1 ${hasExactCentralLocations(originValue, destinationValue) ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{hasExactCentralLocations(originValue, destinationValue) ? "Central exact locations selected" : "Central requires exact autocomplete selection"}</span> : null}
        </div>
      </section>

      {error ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200"><X className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}

      <section className={focusMode ? "sticky top-[84px] grid h-[calc(100vh-104px)] min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" : "sticky top-[84px] grid h-[calc(100vh-104px)] min-h-0 gap-4 xl:grid-cols-[248px_minmax(0,1fr)_340px]"}>
        {!focusMode ? <aside className="min-h-0 overflow-y-auto rounded-xl border border-white/10 bg-[#101318] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">Filter sync</p>
          <div className="mt-4 space-y-4">{sources.map((source) => <SourceSync key={source} source={source} />)}</div>
          <div className="mt-6 border-t border-white/10 pt-4 text-xs leading-5 text-slate-500">Central Dispatch only accepts a city filter after a specific autocomplete option is selected in this workspace. Raw text is never marked applied.</div>
        </aside> : null}

        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#101318]">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div><p className="text-sm font-semibold text-white">{workspace.isSearching ? "Refreshing live feed…" : `${total} loads`}</p><p className="mt-0.5 text-xs text-slate-500">{workspace.result ? `Updated ${formatTime(workspace.result.refreshedAt)} · ${workspace.result.duplicatesRemoved} duplicates merged` : "Connecting to provider sessions…"}</p></div>
            <button type="button" disabled={workspace.isSearching} onClick={applySearch} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${workspace.isSearching ? "animate-spin" : ""}`} />Refresh</button>
          </div>
          {workspace.result?.warnings.find((warning) => !isInformationalFilterWarning(warning)) ? <div className="shrink-0 border-b border-white/10 bg-amber-400/[0.04] px-4 py-2 text-xs text-amber-200">{workspace.result.warnings.find((warning) => !isInformationalFilterWarning(warning))}</div> : null}
          {workspace.result?.warnings.find(isInformationalFilterWarning) ? <div className="shrink-0 border-b border-white/10 bg-cyan-400/[0.04] px-4 py-2 text-xs text-slate-400">{workspace.result.warnings.find(isInformationalFilterWarning)}</div> : null}
          <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-white/[0.07]">
            {workspace.isSearching && !workspace.result ? <div className="grid min-h-72 place-items-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Loading real source data…</div> : null}
            {!workspace.isSearching && !workspace.result?.loads.length ? <div className="grid min-h-72 place-items-center px-8 text-center"><div><Search className="mx-auto h-6 w-6 text-slate-600" /><p className="mt-3 text-sm font-medium text-slate-300">No loads match this filter.</p><p className="mt-1 text-xs text-slate-500">Widen a radius, enable a source, or change the pickup date.</p></div></div> : null}
            {workspace.result?.loads.map((load) => <LoadFeedRow key={load.id} load={load} selected={workspace.selectedLoad?.id === load.id} onSelect={() => workspace.setSelectedLoad(load)} />)}
          </div>
        </div>

        <LoadInspector load={workspace.selectedLoad} onClose={() => workspace.setSelectedLoad(undefined)} onRoute={setRouteLoad} onSave={saveLoad} onRemove={removeSavedLoad} isSaved={workspace.selectedLoad ? savedLoadIds.has(workspace.selectedLoad.id) : false} isSaving={isSavingLoad} />
      </section>

      {routeLoad ? <RouteMapBrowser origin={routeLoad.pickup.location} destination={routeLoad.delivery.location} onClose={() => setRouteLoad(undefined)} /> : null}
    </div>
  );
}

function SourceSync({ source }: { source: LoadBoardId }): JSX.Element {
  const { filterSync } = useLoadWorkspace();
  const status = filterSync[source];
  const tone = status.phase === "synced" ? "text-emerald-300" : status.phase === "failed" || status.phase === "awaiting-selection" ? "text-amber-300" : status.phase === "syncing" ? "text-cyan-200" : "text-slate-400";
  return <div className="flex gap-2.5"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${status.phase === "synced" ? "bg-emerald-400" : status.phase === "failed" || status.phase === "awaiting-selection" ? "bg-amber-400" : status.phase === "syncing" ? "bg-cyan-300 animate-pulse" : "bg-slate-600"}`} /><div><div className="flex items-center gap-2"><SourceBadge source={source} compact /><p className="text-xs font-semibold text-slate-200">{sourceLabel(source)}</p></div><p className={`mt-1 text-xs leading-5 ${tone}`}>{status.message}</p></div></div>;
}

function LoadFeedRow({ load, selected, onSelect }: { load: Load; selected: boolean; onSelect: () => void }): JSX.Element {
  const vehicles = load.vehicles.slice(0, 2).map((vehicle) => [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")).filter(Boolean);
  return <button type="button" onClick={onSelect} className={`group flex w-full items-center gap-4 px-4 py-4 text-left transition ${selected ? "bg-cyan-400/[0.08]" : "hover:bg-white/[0.035]"}`}>
    <div className="hidden w-16 shrink-0 sm:block"><SourceBadges source={load.source} duplicates={load.duplicateSources} /></div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="truncate text-sm font-semibold text-white">{formatLoadLocation(load.pickup.location)}</p><ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-500" /><p className="truncate text-sm font-semibold text-white">{formatLoadLocation(load.delivery.location)}</p></div><p className="mt-1 truncate text-xs text-slate-500">{vehicles.join(" · ") || `${load.vehicles.length} vehicles`} {load.details?.company?.name ? `· ${load.details.company.name}` : ""}</p></div>
    <div className="hidden shrink-0 text-right sm:block"><p className="text-sm font-bold text-emerald-300">{load.price ? formatMoney(load.price.amountCents) : "—"}</p><p className="mt-1 text-xs text-slate-500">{load.distanceMiles ? `${load.distanceMiles.toLocaleString()} mi` : "Mileage pending"}</p></div>
    <div className="sm:hidden"><SourceBadges source={load.source} duplicates={load.duplicateSources} /></div>
  </button>;
}

function LocationPills({ selections, onRemove }: { selections: LocationSelection[]; onRemove: (selection: LocationSelection) => void }): JSX.Element | null {
  if (!selections.length) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5">{selections.map((selection) => <span key={locationKey(selection)} className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-1 text-[11px] font-semibold text-cyan-100"><span>{formatSelection(selection)}</span><button type="button" onClick={() => onRemove(selection)} aria-label={`Remove ${formatSelection(selection)}`} className="rounded-full p-0.5 text-cyan-200 transition hover:bg-cyan-400/20 hover:text-white"><X className="h-3 w-3" /></button></span>)}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element { return <label className="grid gap-1 text-xs font-semibold text-slate-400">{label}{children}</label>; }
const inputClass = "h-10 w-full rounded-md border border-white/10 bg-[#0c0e12] px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/60";

function buildFilters(input: { originValue: string; destinationValue: string; originSelections: LocationSelection[]; destinationSelections: LocationSelection[]; radius: string; vehicleMin: string; vehicleMax: string; minimumRate: string; availableDate: string; selectedSources: LoadBoardId[]; sort: SortField }): SearchFilters {
  const radius = positiveInt(input.radius);
  const minimumRate = positiveNumber(input.minimumRate);
  const vehicleMin = positiveInt(input.vehicleMin);
  const vehicleMax = positiveInt(input.vehicleMax);
  const origin = locationFilter(input.originValue, input.originSelections, radius);
  const destination = locationFilter(input.destinationValue, input.destinationSelections, radius);
  return {
    sources: input.selectedSources,
    ...(origin ? { origin } : {}),
    ...(destination ? { destination } : {}),
    ...(minimumRate !== undefined ? { minRatePerMileCents: Math.round(minimumRate * 100) } : {}),
    ...(vehicleMin !== undefined ? { vehicleCountMin: vehicleMin } : {}),
    ...(vehicleMax !== undefined ? { vehicleCountMax: vehicleMax } : {}),
    ...(input.availableDate ? { availableFrom: new Date(`${input.availableDate}T00:00:00`).toISOString() } : {}),
    statuses: ["available"],
    sort: { field: input.sort, direction: "desc" }
  };
}

function locationFilter(value: string, selections: LocationSelection[], radius: number | undefined): SearchFilters["origin"] | undefined {
  const text = value.trim();
  const cities = selections.map((selection) => selection.city).filter((city): city is string => Boolean(city));
  const states = selections.map((selection) => selection.state).filter((state): state is string => Boolean(state));
  const postalCodes = selections.map((selection) => selection.postalCode).filter((postalCode): postalCode is string => Boolean(postalCode));
  if (!text && !cities.length && !postalCodes.length) return undefined;
  return {
    ...(cities.length || text ? { cities: text ? [...cities, text] : cities } : {}),
    ...(states.length ? { states } : {}),
    ...(postalCodes.length ? { postalCodes } : {}),
    ...(radius ? { radiusMiles: radius } : {})
  };
}

function positiveInt(value: string): number | undefined { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : undefined; }
function positiveNumber(value: string): number | undefined { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : undefined; }
function formatSelection(selection: LocationSelection): string { return [selection.city, selection.state, selection.postalCode].filter(Boolean).join(", "); }
function locationKey(selection: LocationSelection): string { return [selection.city, selection.state, selection.postalCode].filter(Boolean).join("|").toLowerCase(); }
function appendLocation(current: LocationSelection[], selection: LocationSelection): LocationSelection[] { return current.some((item) => locationKey(item) === locationKey(selection)) ? current : [...current, selection]; }
function selectionsFromFilter(filter: SearchFilters["origin"]): LocationSelection[] { const count = Math.max(filter?.cities?.length ?? 0, filter?.states?.length ?? 0, filter?.postalCodes?.length ?? 0); return Array.from({ length: count }, (_, index) => ({ provider: "local" as const, city: filter?.cities?.[Math.min(index, (filter?.cities?.length ?? 1) - 1)], state: filter?.states?.[Math.min(index, (filter?.states?.length ?? 1) - 1)], postalCode: filter?.postalCodes?.[Math.min(index, (filter?.postalCodes?.length ?? 1) - 1)] })).filter((selection) => Boolean(selection.city && (selection.state || selection.postalCode))); }
function hasExactCentralLocations(originValue: string, destinationValue: string): boolean { return !originValue.trim() && !destinationValue.trim(); }
function formatLoadLocation(location: Load["pickup"]["location"]): string { return [location.city, location.state].filter(Boolean).join(", ") || "Location pending"; }
function formatMoney(cents: number): string { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100); }
function formatTime(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "just now" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function filterChips(filters: SearchFilters): string[] { return [[filters.origin?.cities?.[0], filters.origin?.states?.[0]].filter(Boolean).join(", "), [filters.destination?.cities?.[0], filters.destination?.states?.[0]].filter(Boolean).join(", "), filters.origin?.radiusMiles ? `±${filters.origin.radiusMiles} mi` : "", filters.minRatePerMileCents ? `$${(filters.minRatePerMileCents / 100).toFixed(2)}/mi+` : "", filters.vehicleCountMin ? `${filters.vehicleCountMin}${filters.vehicleCountMax ? `–${filters.vehicleCountMax}` : "+"} cars` : ""].filter(Boolean); }
function isInformationalFilterWarning(message: string): boolean { return message.includes("finalized locally after the session search"); }
