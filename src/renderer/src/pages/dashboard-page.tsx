import { Activity, Database, Layers3, RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { DashboardSummary, DatabaseStatus } from "@shared/contracts/ipc";
import type { LoadBoardSummary } from "@shared/types/load-board";
import { desktopApi } from "@/api/client";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export function DashboardPage(): JSX.Element {
  const [summary, setSummary] = useState<DashboardSummary>();
  const [boards, setBoards] = useState<LoadBoardSummary[]>([]);
  const [database, setDatabase] = useState<DatabaseStatus>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;

    void Promise.all([
      desktopApi.dashboard.getSummary(),
      desktopApi.loadBoards.list(),
      desktopApi.database.getStatus()
    ])
      .then(([nextSummary, nextBoards, nextDatabase]) => {
        if (!active) return;
        setSummary(nextSummary);
        setBoards(nextBoards);
        setDatabase(nextDatabase);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Could not load local app data.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">Operations overview</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Dispatcher dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Open Load Boards to connect provider accounts in isolated local browser sessions.
          </p>
        </div>
        <StatusBadge tone="info">Phase 6</StatusBadge>
      </section>

      {error ? (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          {error}
        </Card>
      ) : null}

      {summary?.sampleData ? (
        <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <Activity className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            The loads below are local sample records so you can explore the workspace. No load board
            account has been accessed.
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Available loads"
          value={summary ? String(summary.availableLoads) : "—"}
          detail="Sample records in Phase 1"
          icon={<Layers3 className="h-5 w-5" />}
        />
        <MetricCard
          label="Connected boards"
          value={summary ? String(summary.connectedBoards) : "—"}
          detail="Validated provider sessions"
          icon={<WifiOff className="h-5 w-5" />}
        />
        <MetricCard
          label="Source adapters"
          value={boards.length ? String(boards.length) : "—"}
          detail="Isolated provider boundaries"
          icon={<RefreshCw className="h-5 w-5" />}
        />
        <MetricCard
          label="Local storage"
          value={database?.mode === "ready" ? "Ready" : "—"}
          detail="SQLite session metadata"
          icon={<Database className="h-5 w-5" />}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <h2 className="font-bold text-slate-900">Load board readiness</h2>
              <p className="mt-1 text-sm text-slate-500">Each source stays independent behind its adapter.</p>
            </div>
            <StatusBadge tone={summary?.connectedBoards ? "success" : "warning"}>
              {summary?.connectedBoards ? `${summary.connectedBoards} connected` : "Not connected"}
            </StatusBadge>
          </div>
          <div className="divide-y divide-slate-100">
            {boards.map((board) => (
              <div key={board.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <div>
                  <p className="font-semibold text-slate-800">{board.displayName}</p>
                  <p className="mt-1 text-xs text-slate-500">{board.connection.message}</p>
                </div>
                <StatusBadge tone={board.connection.state === "connected" ? "success" : "neutral"}>
                  {board.connection.state === "connected" ? "Connected" : "Open to connect"}
                </StatusBadge>
              </div>
            ))}
            {!boards.length && !error ? (
              <div className="px-6 py-8 text-sm text-slate-500">Loading sources…</div>
            ) : null}
          </div>
        </Card>

        <Card className="bg-slate-950 p-6 text-slate-100">
          <p className="text-sm font-semibold text-sky-300">Current milestone</p>
          <h2 className="mt-3 text-xl font-bold tracking-tight">Load intelligence &amp; alerts</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Load boards stay in isolated sessions, while the Alerts workspace keeps local rules for
            new opportunities, rate thresholds, and source health.
          </p>
          <div className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-500">
            Database: {database?.mode === "ready" ? "SQLite metadata ready" : "checking"}
          </div>
        </Card>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: string;
  detail: string;
  icon: JSX.Element;
}): JSX.Element {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        </div>
        <div className="rounded-lg bg-sky-50 p-2.5 text-sky-600">{icon}</div>
      </div>
      <p className="mt-4 text-xs text-slate-400">{detail}</p>
    </Card>
  );
}
