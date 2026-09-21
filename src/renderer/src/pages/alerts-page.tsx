import { BellRing, CircleAlert, LoaderCircle, Plus, Radio, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AlertRule, AlertRuleKind } from "@shared/types/alert-rule";
import type { AlertEvent } from "@shared/types/alert-event";
import type { AlertRefreshSettings } from "@shared/types/alert-refresh-settings";
import type { AlertRefreshStatus } from "@shared/types/alert-refresh-settings";
import type { LoadBoardId } from "@shared/types/load-board";
import { desktopApi } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

const boards: Array<{ id: LoadBoardId; label: string }> = [
  { id: "central-dispatch", label: "Central Dispatch" },
  { id: "super-dispatch", label: "Super Dispatch" },
  { id: "ship-cars", label: "Ship.Cars" }
];

const kinds: Array<{ id: AlertRuleKind; label: string; detail: string }> = [
  { id: "new-load", label: "New matching load", detail: "Notify when a newly seen load matches the selected sources." },
  { id: "minimum-price", label: "Minimum price", detail: "Notify when the listed pay reaches your threshold." },
  { id: "minimum-rate", label: "Minimum rate per mile", detail: "Notify when the listed rate reaches your threshold." },
  { id: "session-expired", label: "Session needs attention", detail: "Notify when a connected board requires sign-in again." },
  { id: "adapter-failure", label: "Source refresh issue", detail: "Notify when a board cannot refresh its available loads." }
];

export function AlertsPage(): JSX.Element {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [refreshSettings, setRefreshSettings] = useState<AlertRefreshSettings>();
  const [refreshStatus, setRefreshStatus] = useState<AlertRefreshStatus>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingRefresh, setIsUpdatingRefresh] = useState(false);
  const [isRefreshingNow, setIsRefreshingNow] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState("New high-value loads");
  const [kind, setKind] = useState<AlertRuleKind>("new-load");
  const [sources, setSources] = useState<LoadBoardId[]>(["central-dispatch", "super-dispatch"]);
  const [threshold, setThreshold] = useState("1000");

  useEffect(() => {
    void Promise.all([desktopApi.alerts.list(), desktopApi.alerts.listEvents(), desktopApi.alerts.getRefreshSettings(), desktopApi.alerts.getRefreshStatus()])
      .then(([nextRules, nextEvents, nextRefreshSettings, nextRefreshStatus]) => {
        setRules(nextRules);
        setEvents(nextEvents);
        setRefreshSettings(nextRefreshSettings);
        setRefreshStatus(nextRefreshStatus);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load alerts."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    const readStatus = (): void => {
      void desktopApi.alerts.getRefreshStatus().then((status) => { if (active) setRefreshStatus(status); });
    };
    readStatus();
    const timer = window.setInterval(readStatus, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const needsThreshold = kind === "minimum-price" || kind === "minimum-rate";

  async function saveRule(): Promise<void> {
    const numericThreshold = Math.round(Number(threshold) * 100);
    if (!name.trim() || (needsThreshold && (!Number.isFinite(numericThreshold) || numericThreshold < 0))) {
      setError("Enter a rule name and a valid threshold.");
      return;
    }
    setIsSaving(true);
    setError(undefined);
    try {
      const rule = await desktopApi.alerts.save({
        name: name.trim(), kind, enabled: true, sources: sources.length ? sources : undefined,
        ...(kind === "minimum-price" ? { minimumPriceCents: numericThreshold } : {}),
        ...(kind === "minimum-rate" ? { minimumRatePerMileCents: numericThreshold } : {})
      });
      setRules((current) => [rule, ...current]);
      setName("New high-value loads");
      setKind("new-load");
      setThreshold("1000");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the alert.");
    } finally { setIsSaving(false); }
  }

  async function toggleRule(rule: AlertRule): Promise<void> {
    try {
      const updated = await desktopApi.alerts.setEnabled(rule.id, !rule.enabled);
      setRules((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the alert."); }
  }

  async function deleteRule(id: string): Promise<void> {
    try {
      await desktopApi.alerts.delete(id);
      setRules((current) => current.filter((rule) => rule.id !== id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove the alert."); }
  }

  async function saveRefreshSettings(next: AlertRefreshSettings): Promise<void> {
    setIsUpdatingRefresh(true);
    setError(undefined);
    try { setRefreshSettings(await desktopApi.alerts.saveRefreshSettings(next)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update auto refresh."); }
    finally { setIsUpdatingRefresh(false); }
  }

  async function refreshNow(): Promise<void> {
    setIsRefreshingNow(true);
    setError(undefined);
    try {
      await desktopApi.alerts.refreshNow();
      setEvents(await desktopApi.alerts.listEvents());
      setRefreshStatus(await desktopApi.alerts.getRefreshStatus());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not refresh load alerts."); }
    finally { setIsRefreshingNow(false); }
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">Operations control</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Alerts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Create low-noise rules for opportunities and source health. Rules are stored locally on this computer.</p>
        </div>
        <StatusBadge tone="info"><BellRing className="h-3.5 w-3.5" /> Phase 6</StatusBadge>
      </section>

      {error ? <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><CircleAlert className="mr-2 inline h-4 w-4" />{error}</Card> : null}

      <Card className="flex flex-wrap items-center justify-between gap-5 p-5">
        <div className="flex items-start gap-3"><div className={`rounded-xl p-2.5 ${refreshSettings?.enabled ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}><RefreshCw className={`h-5 w-5 ${isRefreshingNow || refreshStatus?.isRefreshing ? "animate-spin" : ""}`} /></div><div><p className="font-bold text-slate-900">Auto-refresh load alerts</p><p className="mt-1 text-sm text-slate-500">When enabled, the app checks available loads and Load Board health while it is open.</p><p className={`mt-1 text-xs font-medium ${refreshStatus?.lastError ? "text-rose-600" : "text-slate-400"}`}>{refreshStatus?.isRefreshing ? "Checking sources now…" : refreshStatus?.lastError ? `Last check: ${refreshStatus.lastError}` : refreshStatus?.lastCompletedAt ? `Last successful check: ${formatRefreshTime(refreshStatus.lastCompletedAt)}` : "No automatic check has run yet."}</p></div></div>
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="Refresh interval" disabled={!refreshSettings || isUpdatingRefresh} value={refreshSettings?.intervalMinutes ?? 15} onChange={(event) => refreshSettings && void saveRefreshSettings({ ...refreshSettings, intervalMinutes: Number(event.target.value) as AlertRefreshSettings["intervalMinutes"] })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"><option value={0.5}>Every 30 sec</option><option value={1}>Every 1 min</option><option value={5}>Every 5 min</option><option value={10}>Every 10 min</option><option value={15}>Every 15 min</option><option value={30}>Every 30 min</option></select>
          <Button disabled={isRefreshingNow} onClick={() => void refreshNow()} size="sm" variant="secondary">{isRefreshingNow ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh now</Button>
          <button type="button" disabled={!refreshSettings || isUpdatingRefresh} aria-label={refreshSettings?.enabled ? "Disable auto-refresh" : "Enable auto-refresh"} onClick={() => refreshSettings && void saveRefreshSettings({ ...refreshSettings, enabled: !refreshSettings.enabled })} className={`relative h-7 w-12 rounded-full transition disabled:opacity-50 ${refreshSettings?.enabled ? "bg-emerald-500" : "bg-slate-300"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${refreshSettings?.enabled ? "left-6" : "left-1"}`} /></button>
        </div>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.35fr]">
        <Card className="p-6">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-sky-50 p-2.5 text-sky-700"><Plus className="h-5 w-5" /></div><div><h2 className="font-bold text-slate-900">Create an alert</h2><p className="text-sm text-slate-500">Choose what needs attention.</p></div></div>
          <label className="mt-6 block text-sm font-semibold text-slate-700">Alert name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100" /></label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">When<select value={kind} onChange={(event) => setKind(event.target.value as AlertRuleKind)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100">{kinds.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
          {needsThreshold ? <label className="mt-4 block text-sm font-semibold text-slate-700">{kind === "minimum-price" ? "Minimum price, $" : "Minimum rate per mile, $"}<input inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" /></label> : null}
          <p className="mt-4 text-sm font-semibold text-slate-700">Sources</p>
          <div className="mt-2 flex flex-wrap gap-2">{boards.map((board) => <button key={board.id} type="button" onClick={() => setSources((current) => current.includes(board.id) ? current.filter((id) => id !== board.id) : [...current, board.id])} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${sources.includes(board.id) ? "border-sky-500 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>{board.label}</button>)}</div>
          <Button className="mt-6 w-full" disabled={isSaving} onClick={() => void saveRule()}>{isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}Save alert</Button>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="font-bold text-slate-900">Your alert rules</h2><p className="mt-1 text-sm text-slate-500">Load rules run after refresh; source-health rules run when boards are checked.</p></div><StatusBadge tone={rules.filter((rule) => rule.enabled).length ? "success" : "neutral"}>{rules.filter((rule) => rule.enabled).length} active</StatusBadge></div>
          <div className="divide-y divide-slate-100">
            {isLoading ? <div className="grid min-h-56 place-items-center text-sm text-slate-400"><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" /> Loading alerts…</div> : null}
            {!isLoading && !rules.length ? <div className="grid min-h-56 place-items-center px-6 text-center"><div><Radio className="mx-auto h-7 w-7 text-sky-500" /><p className="mt-3 font-semibold text-slate-800">No alerts yet</p><p className="mt-1 text-sm text-slate-500">Create one to start monitoring new opportunities and source health.</p></div></div> : null}
            {rules.map((rule) => <AlertRuleRow key={rule.id} rule={rule} onToggle={() => void toggleRule(rule)} onDelete={() => void deleteRule(rule.id)} />)}
          </div>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-5"><h2 className="font-bold text-slate-900">Recent alert activity</h2><p className="mt-1 text-sm text-slate-500">Only alerts generated after their quiet first scan are listed here.</p></div>
        <div className="divide-y divide-slate-100">
          {!events.length ? <div className="px-6 py-8 text-sm text-slate-500">No alert activity yet. Refresh the Loads page once to establish the baseline for each new rule.</div> : null}
          {events.map((event) => <div key={event.id} className="flex items-start gap-3 px-6 py-4"><BellRing className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" /><div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{event.title}</p><p className="mt-1 text-sm text-slate-500">{event.message}</p><p className="mt-1 text-xs text-slate-400">{event.ruleName} · {new Date(event.occurredAt).toLocaleString()}</p></div></div>)}
        </div>
      </Card>
    </div>
  );
}

function AlertRuleRow({ rule, onToggle, onDelete }: { rule: AlertRule; onToggle: () => void; onDelete: () => void }): JSX.Element {
  const kind = kinds.find((option) => option.id === rule.kind);
  const threshold = rule.minimumPriceCents !== undefined ? ` · $${(rule.minimumPriceCents / 100).toLocaleString()}+` : rule.minimumRatePerMileCents !== undefined ? ` · $${(rule.minimumRatePerMileCents / 100).toFixed(2)}/mi+` : "";
  return <div className="flex items-center gap-4 px-6 py-4"><button type="button" aria-label={rule.enabled ? "Disable alert" : "Enable alert"} onClick={onToggle} className={`relative h-6 w-11 rounded-full transition ${rule.enabled ? "bg-emerald-500" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${rule.enabled ? "left-[22px]" : "left-0.5"}`} /></button><div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{rule.name}</p><p className="mt-1 truncate text-xs text-slate-500">{kind?.label}{threshold} · {rule.sources?.length ? rule.sources.map((source) => boards.find((board) => board.id === source)?.label).join(", ") : "All sources"}</p></div><button type="button" aria-label="Delete alert" onClick={onDelete} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>;
}

function formatRefreshTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "just now" : date.toLocaleString();
}
