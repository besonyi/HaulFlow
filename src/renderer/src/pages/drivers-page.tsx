import { CalendarClock, Truck, UserRoundPlus } from "lucide-react";

export function DriversPage(): JSX.Element {
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Fleet workspace</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Drivers</h1><p className="mt-1 text-sm text-slate-400">A ready surface for dispatch matching, without inventing fleet records that do not exist yet.</p></div><button disabled className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-semibold text-slate-500"><UserRoundPlus className="h-3.5 w-3.5" />Add driver</button></section>
      <section className="grid min-h-[430px] place-items-center rounded-xl border border-white/10 bg-[#101318] px-6 py-14 text-center"><div className="max-w-md"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300"><Truck className="h-7 w-7" /></div><h2 className="mt-5 text-xl font-semibold text-white">Fleet matching starts here</h2><p className="mt-3 text-sm leading-6 text-slate-400">The existing app has no driver, truck, trailer, capacity, or availability store yet. This page remains intentionally empty rather than showing fictional dispatch data.</p><div className="mt-5 flex justify-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-200"><CalendarClock className="h-3.5 w-3.5" />Next data model</span><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-slate-400">No driver data</span></div></div></section>
    </div>
  );
}
