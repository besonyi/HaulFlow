import { ArrowRight, MapPinned, Route } from "lucide-react";
import { useState } from "react";
import { RouteMapBrowser } from "@/components/route-map-browser";
import { SourceBadges } from "@/components/ui/source-badge";
import { useLoadWorkspace } from "@/components/workspace/load-workspace";

export function RoutesPage(): JSX.Element {
  const { selectedLoad } = useLoadWorkspace();
  const [showMap, setShowMap] = useState(false);

  return (
    <div className="space-y-5">
      <section><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Planner</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Lane planning starts with the selected load.</h1><p className="mt-1 text-sm text-slate-400">A route stays connected to the live normalized load you selected in Search.</p></section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[400px] overflow-hidden rounded-xl border border-white/10 bg-[#101318] p-6">
          <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(148,163,184,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.06)_1px,transparent_1px)] [background-size:30px_30px]" />
          {selectedLoad ? <div className="relative"><div className="flex items-center gap-2"><SourceBadges source={selectedLoad.source} duplicates={selectedLoad.duplicateSources} /><span className="text-xs text-slate-500">Current candidate</span></div><p className="mt-8 text-lg font-semibold text-white">{formatLocation(selectedLoad.pickup.location)}</p><div className="my-4 flex items-center gap-3 text-cyan-300"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400 ring-8 ring-emerald-400/10" /><div className="h-px flex-1 max-w-md bg-gradient-to-r from-emerald-400 via-cyan-300 to-sky-400" /><ArrowRight className="h-5 w-5" /></div><p className="text-lg font-semibold text-white">{formatLocation(selectedLoad.delivery.location)}</p><button type="button" onClick={() => setShowMap(true)} className="mt-8 inline-flex h-9 items-center gap-2 rounded-md bg-cyan-400 px-3 text-xs font-bold text-slate-950 transition hover:bg-cyan-300"><MapPinned className="h-3.5 w-3.5" />Open route map</button></div> : <div className="relative grid min-h-[350px] place-items-center text-center"><div><Route className="mx-auto h-7 w-7 text-slate-600" /><p className="mt-3 text-sm font-medium text-slate-300">Choose a live load in Search</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">The planner will use its real pickup and delivery locations—no placeholder route is created.</p></div></div>}
        </div>
        <aside className="rounded-xl border border-white/10 bg-[#101318] p-5"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Lane workspace</p><p className="mt-4 text-sm font-semibold text-white">Next build step</p><p className="mt-2 text-sm leading-6 text-slate-400">Driver, trailer capacity, deadhead, and profitability records are not in the current data model, so the planner intentionally does not invent them.</p><div className="mt-6 border-t border-white/10 pt-4 text-xs leading-5 text-slate-500">The route preview is already connected to selected normalized loads.</div></aside>
      </section>
      {showMap && selectedLoad ? <RouteMapBrowser origin={selectedLoad.pickup.location} destination={selectedLoad.delivery.location} onClose={() => setShowMap(false)} /> : null}
    </div>
  );
}

function formatLocation(location: { city?: string; state?: string; postalCode?: string }): string { return [location.city, location.state, location.postalCode].filter(Boolean).join(", ") || "Location pending"; }
