import {
  ArrowLeft,
  ArrowRight,
  Cable,
  ExternalLink,
  Home,
  LoaderCircle,
  LockKeyhole,
  Network,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import type { BrowserViewBounds, LoadBoardBrowserAction } from "@shared/contracts/ipc";
import type {
  LoadBoardBrowserState,
  LoadBoardConnectionState,
  LoadBoardId,
  LoadBoardIntegrationState,
  LoadBoardStateEvent,
  LoadBoardSummary,
  ObservedLoadBoardEndpoint
} from "@shared/types/load-board";
import { desktopApi } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { SourceBadge } from "@/components/ui/source-badge";

export function LoadBoardsPage(): JSX.Element {
  const [boards, setBoards] = useState<LoadBoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<LoadBoardId>();
  const [browserState, setBrowserState] = useState<LoadBoardBrowserState>();
  const [observedEndpoints, setObservedEndpoints] = useState<ObservedLoadBoardEndpoint[]>([]);
  const [error, setError] = useState<string>();
  const browserSurfaceRef = useRef<HTMLDivElement>(null);
  const browserPanelRef = useRef<HTMLDivElement>(null);

  const refreshBoards = useCallback(async (): Promise<void> => {
    try {
      setBoards(await desktopApi.loadBoards.list());
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load source sessions.");
    }
  }, []);

  const refreshObservedEndpoints = useCallback(async (boardId: LoadBoardId): Promise<void> => {
    try {
      setObservedEndpoints(await desktopApi.loadBoards.listObservedEndpoints(boardId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read observed endpoints.");
    }
  }, []);

  useEffect(() => {
    void refreshBoards();
  }, [refreshBoards]);

  useEffect(() => {
    return desktopApi.loadBoards.onStateChanged((event) => {
      applyStateEvent(setBoards, event);
      if (event.browser.boardId === activeBoardId) setBrowserState(event.browser);
    });
  }, [activeBoardId]);

  useEffect(() => {
    if (!activeBoardId) return;
    requestAnimationFrame(() => {
      browserPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeBoardId]);

  useEffect(() => {
    if (!activeBoardId) {
      setObservedEndpoints([]);
      return;
    }
    void refreshObservedEndpoints(activeBoardId);
  }, [activeBoardId, refreshObservedEndpoints]);

  useLayoutEffect(() => {
    if (!activeBoardId || !browserSurfaceRef.current) return;

    const surface = browserSurfaceRef.current;
    let cancelled = false;
    let opened = false;

    const readBounds = (): BrowserViewBounds => {
      const rect = surface.getBoundingClientRect();
      return {
        x: Math.max(0, Math.round(rect.x)),
        y: Math.max(0, Math.round(rect.y)),
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(240, Math.round(rect.height))
      };
    };

    const syncBounds = (): void => {
      if (opened) void desktopApi.loadBoards.resize(activeBoardId, readBounds());
    };

    void desktopApi.loadBoards
      .open(activeBoardId, readBounds())
      .then((state) => {
        if (cancelled) return;
        opened = true;
        setBrowserState(state);
        syncBounds();
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not open the provider browser.");
        }
      });

    const observer = new ResizeObserver(syncBounds);
    observer.observe(surface);
    window.addEventListener("resize", syncBounds);
    window.addEventListener("scroll", syncBounds, true);

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.removeEventListener("scroll", syncBounds, true);
      void desktopApi.loadBoards.close(activeBoardId);
    };
  }, [activeBoardId]);

  const activeBoard = boards.find((board) => board.id === activeBoardId);

  async function navigate(action: LoadBoardBrowserAction): Promise<void> {
    if (!activeBoardId) return;
    try {
      setBrowserState(await desktopApi.loadBoards.navigate(activeBoardId, action));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Browser navigation failed.");
    }
  }

  async function clearSession(board: LoadBoardSummary): Promise<void> {
    const confirmed = window.confirm(
      `Clear the saved ${board.displayName} session? You will need to sign in again.`
    );
    if (!confirmed) return;

    try {
      const event = await desktopApi.loadBoards.clearSession(board.id);
      applyStateEvent(setBoards, event);
      if (activeBoardId === board.id) {
        setActiveBoardId(undefined);
        setBrowserState(undefined);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not clear the saved session.");
    }
  }

  return (
    <div className="sessions-page space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-300">Provider workspace</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Sessions</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Sign in directly with each provider. Every source uses its own persistent, isolated browser session.
          </p>
        </div>
        <StatusBadge tone="info">Isolated source sessions</StatusBadge>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Passwords, MFA codes, and cookies stay inside the provider browser partition. The app UI receives only connection status and navigation state.
        </p>
      </div>

      {error ? <Card className="border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">{error}</Card> : null}

      <section className="grid gap-5 xl:grid-cols-3">
        {boards.map((board) => {
          const isActive = board.id === activeBoardId;
          const hasStoredSession = board.browser?.hasStoredSession ?? false;

          return (
            <Card key={board.id} className="flex min-h-96 flex-col p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                  <SourceBadge source={board.id} />
                </div>
                <StatusBadge tone={connectionTone(board.connection.state)}>
                  {connectionLabel(board.connection.state)}
                </StatusBadge>
              </div>
              <div className="mt-6">
                <h2 className="text-lg font-bold text-slate-900">{board.displayName}</h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{board.connection.message}</p>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  {hasStoredSession ? "Local session data saved" : "No local session data"}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <Network className="h-3.5 w-3.5" />
                  {board.observedEndpointCount ?? 0} session endpoints observed
                </div>
                <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <Cable className="h-3.5 w-3.5" />
                      {board.integration.channel === "session-endpoint"
                        ? "Session endpoint"
                        : "Official API"}
                    </span>
                    <StatusBadge tone={integrationTone(board.integration.state)}>
                      {integrationLabel(board.integration.state)}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {board.integration.message}
                  </p>
                  {board.integration.channel === "official-api" ? (
                    <a
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900"
                      href={board.integration.documentationUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      API documentation <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <a
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-sky-900"
                  href={board.portalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  External portal <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <div className="flex gap-2">
                  <Button
                    aria-label={`Clear ${board.displayName} session`}
                    disabled={!hasStoredSession}
                    onClick={() => void clearSession(board)}
                    size="sm"
                    title="Clear saved session"
                    variant="ghost"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    onClick={() => setActiveBoardId(board.id)}
                    size="sm"
                    variant={isActive ? "secondary" : "outline"}
                  >
                    {isActive ? "Browser open" : hasStoredSession ? "Open session" : "Connect"}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      {!boards.length && !error ? <Card className="p-6 text-sm text-slate-500">Loading source sessions…</Card> : null}

      {activeBoard ? (
        <div ref={browserPanelRef} className="scroll-mt-20">
          <Card className="overflow-hidden">
            <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
              <div className="flex items-center gap-1">
                <ToolbarButton
                  disabled={!browserState?.canGoBack}
                  label="Back"
                  onClick={() => void navigate("back")}
                >
                  <ArrowLeft className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  disabled={!browserState?.canGoForward}
                  label="Forward"
                  onClick={() => void navigate("forward")}
                >
                  <ArrowRight className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Reload" onClick={() => void navigate("reload")}>
                  <RefreshCw className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton label="Provider home" onClick={() => void navigate("home")}>
                  <Home className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton
                  label="Refresh observed endpoints"
                  onClick={() => void refreshObservedEndpoints(activeBoard.id)}
                >
                  <Network className="h-4 w-4" />
                </ToolbarButton>
              </div>

              <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-sm text-slate-500">
                {browserState?.isLoading ? <LoaderCircle className="h-4 w-4 animate-spin text-sky-500" /> : <LockKeyhole className="h-4 w-4 text-emerald-600" />}
                <span className="truncate font-medium text-slate-700">{activeBoard.displayName}</span>
                <span className="hidden truncate text-xs text-slate-400 md:inline">{browserState?.currentHost ?? "Opening secure session…"}</span>
              </div>

              <Button
                aria-label="Close provider browser"
                onClick={() => {
                  setActiveBoardId(undefined);
                  setBrowserState(undefined);
                }}
                size="sm"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {browserState?.error ? (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                {browserState.error}
              </div>
            ) : null}

            <div
              ref={browserSurfaceRef}
              className="grid h-[620px] place-items-center bg-white text-sm text-slate-400"
            >
              Opening the isolated provider browser…
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Observed session endpoints</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Only method, sanitized path, query names, and status are stored.
                  </p>
                </div>
                <Button
                  onClick={() => void refreshObservedEndpoints(activeBoard.id)}
                  size="sm"
                  variant="outline"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {observedEndpoints.map((endpoint) => (
                  <div
                    key={`${endpoint.method}:${endpoint.origin}:${endpoint.pathTemplate}:${endpoint.queryParameterNames.join(",")}`}
                    className="grid gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs md:grid-cols-[70px_1fr_auto] md:items-center"
                  >
                    <span className="font-bold text-sky-700">{endpoint.method}</span>
                    <span className="min-w-0 truncate font-mono text-slate-600">
                      {endpoint.origin}{endpoint.pathTemplate}
                      {endpoint.queryParameterNames.length
                        ? `?${endpoint.queryParameterNames.join("&")}`
                        : ""}
                    </span>
                    <span className="text-slate-400">
                      HTTP {endpoint.statusCode} · {endpoint.observationCount}×
                    </span>
                  </div>
                ))}
                {!observedEndpoints.length ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-xs text-slate-500">
                    Open this board and perform a normal load search, then refresh this list.
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  children,
  disabled,
  label,
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <Button
      aria-label={label}
      className="h-8 w-8 p-0"
      disabled={disabled}
      onClick={onClick}
      size="sm"
      title={label}
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function applyStateEvent(
  setBoards: React.Dispatch<React.SetStateAction<LoadBoardSummary[]>>,
  event: LoadBoardStateEvent
): void {
  setBoards((current) =>
    current.map((board) =>
      board.id === event.browser.boardId
        ? { ...board, browser: event.browser, connection: event.connection }
        : board
    )
  );
}

function connectionLabel(state: LoadBoardConnectionState): string {
  return {
    "not-configured": "Not configured",
    disconnected: "Disconnected",
    connected: "Connected",
    expired: "Sign-in expired",
    error: "Needs attention"
  }[state];
}

function connectionTone(
  state: LoadBoardConnectionState
): "neutral" | "success" | "warning" | "info" {
  if (state === "connected") return "success";
  if (state === "expired" || state === "error") return "warning";
  if (state === "not-configured") return "info";
  return "neutral";
}

function integrationLabel(state: LoadBoardIntegrationState): string {
  return {
    "credentials-required": "Access required",
    ready: "Ready",
    limited: "Discovering",
    error: "Needs attention"
  }[state];
}

function integrationTone(
  state: LoadBoardIntegrationState
): "neutral" | "success" | "warning" | "info" {
  if (state === "ready") return "success";
  if (state === "error") return "warning";
  if (state === "limited") return "neutral";
  return "info";
}
