import { Bookmark, LoaderCircle, MapPinned, Play, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SavedSearch } from "@shared/types/saved-search";
import type { SavedLoad } from "@shared/types/saved-load";
import { SourceBadges } from "@/components/ui/source-badge";
import { desktopApi } from "@/api/client";
import { useLoadWorkspace } from "@/components/workspace/load-workspace";

export function MyLoadsPage(): JSX.Element {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedLoads, setSavedLoads] = useState<SavedLoad[]>([]);
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const { runSearch, isSearching, setSelectedLoad } = useLoadWorkspace();
  const navigate = useNavigate();

  const loadSavedSearches = useCallback(async () => {
    setIsLoading(true);
    try {
      const [searches, loads] = await Promise.all([
        desktopApi.loads.listSavedSearches(),
        desktopApi.loads.listSavedLoads()
      ]);
      setSavedSearches(searches);
      setSavedLoads(loads);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load saved searches.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadSavedSearches(); }, [loadSavedSearches]);

  async function openSavedSearch(savedSearch: SavedSearch): Promise<void> {
    const result = await runSearch(savedSearch.filters);
    if (result) navigate("/search");
  }

  async function removeSavedSearch(savedSearch: SavedSearch): Promise<void> {
    if (!window.confirm(`Delete saved search “${savedSearch.name}”?`)) return;
    try {
      await desktopApi.loads.deleteSavedSearch(savedSearch.id);
      setSavedSearches((current) => current.filter((item) => item.id !== savedSearch.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete saved search.");
    }
  }

  async function removeSavedLoad(savedLoad: SavedLoad): Promise<void> {
    if (!window.confirm("Remove this load from My Loads?")) return;
    try {
      await desktopApi.loads.deleteSavedLoad(savedLoad.id);
      setSavedLoads((current) => current.filter((item) => item.id !== savedLoad.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove this saved load.");
    }
  }

  function openSavedLoad(savedLoad: SavedLoad): void {
    setSelectedLoad(savedLoad.load);
    navigate("/planner");
  }

  return <div className="space-y-5">
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">My workspace</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">My Loads</h1>
      <p className="mt-1 text-sm text-slate-400">Real provider snapshots you save, plus reusable live searches stored on this device.</p>
    </section>
    {error ? <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200">{error}</div> : null}
    <section className="overflow-hidden rounded-xl border border-white/10 bg-[#101318]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="text-sm font-semibold text-white">Saved loads</p><p className="mt-1 text-xs text-slate-500">A saved record preserves its actual normalized provider snapshot.</p></div><span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-300">{savedLoads.length}</span></div>
      {isLoading ? <div className="grid min-h-40 place-items-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Loading My Loads…</div> : null}
      {!isLoading && !savedLoads.length ? <div className="grid min-h-40 place-items-center px-6 text-center"><div><Bookmark className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-3 text-sm font-medium text-slate-300">No saved loads yet</p><p className="mt-1 text-xs text-slate-500">Open a load in Search and use the inspector to save its real provider snapshot.</p></div></div> : null}
      <div className="divide-y divide-white/[0.07]">{savedLoads.map((savedLoad) => <article key={savedLoad.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="shrink-0"><SourceBadges source={savedLoad.load.source} duplicates={savedLoad.load.duplicateSources} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{formatLocation(savedLoad.load.pickup.location)} <span className="px-1 text-slate-500">→</span> {formatLocation(savedLoad.load.delivery.location)}</p><p className="mt-1 truncate text-xs text-slate-500">{describeLoad(savedLoad)} · Saved {formatDate(savedLoad.updatedAt)}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => openSavedLoad(savedLoad)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-cyan-400 px-3 text-xs font-bold text-slate-950 transition hover:bg-cyan-300"><MapPinned className="h-3.5 w-3.5" />Plan</button><button type="button" onClick={() => void removeSavedLoad(savedLoad)} aria-label="Remove saved load" className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition hover:bg-rose-400/10 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button></div></article>)}</div>
    </section>
    <section className="overflow-hidden rounded-xl border border-white/10 bg-[#101318]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="text-sm font-semibold text-white">Your saved filters</p><p className="mt-1 text-xs text-slate-500">Save another search from the Advanced Search workspace.</p></div><span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-300">{savedSearches.length}</span></div>
      {isLoading ? <div className="grid min-h-64 place-items-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />Loading saved searches…</div> : null}
      {!isLoading && !savedSearches.length ? <div className="grid min-h-64 place-items-center px-6 text-center"><div><Bookmark className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-3 text-sm font-medium text-slate-300">No saved searches yet</p><p className="mt-1 text-xs text-slate-500">The live Search workspace remains available; saved searches are created by the existing advanced filter screen.</p></div></div> : null}
      <div className="divide-y divide-white/[0.07]">{savedSearches.map((savedSearch) => <article key={savedSearch.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{savedSearch.name}</p><p className="mt-1 text-xs text-slate-500">{describeFilters(savedSearch)}</p></div><div className="flex items-center gap-2"><button disabled={isSearching} type="button" onClick={() => void openSavedSearch(savedSearch)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-cyan-400 px-3 text-xs font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"><Play className="h-3.5 w-3.5" />Open</button><button type="button" onClick={() => void removeSavedSearch(savedSearch)} aria-label={`Delete ${savedSearch.name}`} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition hover:bg-rose-400/10 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button></div></article>)}</div>
    </section>
  </div>;
}

function formatLocation(location: SavedLoad["load"]["pickup"]["location"]): string {
  return [location.city, location.state].filter(Boolean).join(", ") || "Location pending";
}

function describeLoad(savedLoad: SavedLoad): string {
  const { load } = savedLoad;
  const vehicles = load.vehicles.length === 1 ? "1 vehicle" : `${load.vehicles.length} vehicles`;
  const pay = load.price ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(load.price.amountCents / 100) : "Rate pending";
  return `${vehicles} · ${pay}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function describeFilters(savedSearch: SavedSearch): string {
  const filters = savedSearch.filters;
  const origin = [filters.origin?.cities?.[0], filters.origin?.states?.[0]].filter(Boolean).join(", ");
  const destination = [filters.destination?.cities?.[0], filters.destination?.states?.[0]].filter(Boolean).join(", ");
  const route = [origin, destination].filter(Boolean).join(" → ") || "All lanes";
  const boards = filters.sources?.length ? `${filters.sources.length} source${filters.sources.length === 1 ? "" : "s"}` : "All sources";
  return `${route} · ${boards}`;
}
