import { BellRing, ClipboardList, LayoutPanelTop, Moon, Route, Search, Settings2, Sun, Truck, UsersRound, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { LoadBoardId, LoadBoardSummary, LoadBoardStateEvent } from "@shared/types/load-board";
import { desktopApi } from "@/api/client";
import { SourceBadge, sourceLabel } from "@/components/ui/source-badge";
import { cn } from "@/lib/utils";

interface NavigationItem { label: string; to: string; icon: LucideIcon; }
const navigation: NavigationItem[] = [
  { label: "Search", to: "/search", icon: Search }, { label: "Planner", to: "/planner", icon: Route },
  { label: "My Loads", to: "/my-loads", icon: ClipboardList }, { label: "Drivers", to: "/drivers", icon: UsersRound },
  { label: "Sessions", to: "/sessions", icon: LayoutPanelTop }
];

export function AppShell({ children }: PropsWithChildren): JSX.Element {
  const navigate = useNavigate();
  const [isLauncherOpen, setIsLauncherOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => readTheme());
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("haulflow-theme", theme);
  }, [theme]);
  useCommandShortcut(() => setIsLauncherOpen(true));
  return <div className="theme-shell min-h-screen bg-[#0b0d10] text-slate-100">
    <aside className="theme-sidebar fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-white/[0.08] bg-[#0d0f13] px-3 py-4 lg:flex">
      <button type="button" onClick={() => navigate("/search")} className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.04]"><span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/15"><Truck className="h-4.5 w-4.5" /></span><span><span className="block text-sm font-bold tracking-tight text-white">HaulFlow</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Dispatch terminal</span></span></button>
      <nav className="mt-8 space-y-1" aria-label="Main navigation">{navigation.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition", isActive ? "bg-white/[0.08] text-white shadow-sm" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200")}><Icon className="h-4 w-4" />{label}</NavLink>)}</nav>
      <div className="mt-7 border-t border-white/[0.08] pt-5"><p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Live sessions</p><SessionStatusRail onOpenSessions={() => navigate("/sessions")} /></div>
      <div className="mt-auto space-y-1 border-t border-white/[0.08] pt-3"><NavLink to="/loads" className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"><Settings2 className="h-3.5 w-3.5" />Advanced search</NavLink><NavLink to="/alerts" className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"><BellRing className="h-3.5 w-3.5" />Alerts</NavLink></div>
    </aside>
    <div className="min-h-screen lg:pl-60"><header className="theme-header sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-white/[0.08] bg-[#0b0d10]/90 px-4 backdrop-blur-xl sm:px-6"><button type="button" onClick={() => setIsLauncherOpen(true)} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.10] bg-white/[0.035] px-3 text-left text-sm text-slate-500 transition hover:border-white/[0.18] hover:text-slate-300"><Search className="h-4 w-4 shrink-0" /><span className="truncate">Search all loads or open a workspace…</span><kbd className="ml-auto hidden rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline-flex">⌘K</kbd></button><button type="button" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Light theme" : "Dark theme"} className="theme-toggle grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.10] bg-white/[0.035] text-slate-400 transition hover:border-white/[0.18] hover:text-slate-200">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button><div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Desktop workspace</div></header><main className="mx-auto w-full max-w-[1760px] px-4 py-5 sm:px-6 lg:px-7">{children}</main></div>
    {isLauncherOpen ? <UniversalSearch onClose={() => setIsLauncherOpen(false)} onNavigate={(to) => { navigate(to); setIsLauncherOpen(false); }} /> : null}
  </div>;
}

function UniversalSearch({ onClose, onNavigate }: { onClose: () => void; onNavigate: (to: string) => void }): JSX.Element {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const workspaces = navigation.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose]);
  const openSearch = (): void => onNavigate(`/search?q=${encodeURIComponent(query.trim())}`);
  return <div role="dialog" aria-modal="true" aria-label="Universal search" className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 px-4 pt-[14vh] backdrop-blur-sm" onMouseDown={onClose}>
    <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-[#13171e] shadow-2xl shadow-black/60" onMouseDown={(event) => event.stopPropagation()}>
      <form onSubmit={(event) => { event.preventDefault(); openSearch(); }} className="flex items-center gap-3 border-b border-white/10 px-4"><Search className="h-4 w-4 shrink-0 text-cyan-300" /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a city, then choose its exact autocomplete result…" className="h-14 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" /><button type="button" onClick={onClose} aria-label="Close universal search" className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button></form>
      <div className="p-2"><p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Workspaces</p>{workspaces.map((item) => { const Icon = item.icon; return <button key={item.to} type="button" onClick={() => onNavigate(item.to)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"><Icon className="h-4 w-4 text-slate-500" />{item.label}</button>; })}{query.trim() ? <button type="button" onClick={openSearch} className="mt-1 flex w-full items-center gap-3 rounded-lg bg-cyan-400/10 px-3 py-3 text-left text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/15"><Search className="h-4 w-4 text-cyan-300" />Use “{query.trim()}” in live Search <span className="ml-auto text-xs font-normal text-cyan-300">Enter</span></button> : null}</div>
      <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-2.5 text-[11px] text-slate-600"><span>City text still needs an exact provider autocomplete selection for Central Dispatch.</span><kbd className="rounded border border-white/10 px-1.5 py-0.5">Esc</kbd></div>
    </div>
  </div>;
}

function SessionStatusRail({ onOpenSessions }: { onOpenSessions: () => void }): JSX.Element {
  const [boards, setBoards] = useState<LoadBoardSummary[]>([]);
  useEffect(() => { let active = true; void desktopApi.loadBoards.list().then((next) => { if (active) setBoards(next); }).catch(() => undefined); const unsubscribe = desktopApi.loadBoards.onStateChanged((event) => { if (active) setBoards((current) => applyStateEvent(current, event)); }); return () => { active = false; unsubscribe(); }; }, []);
  return <div className="mt-2 space-y-1">{(["central-dispatch", "super-dispatch", "ship-cars"] as LoadBoardId[]).map((id) => { const board = boards.find((item) => item.id === id); const state = board?.connection.state ?? "disconnected"; const tone = state === "connected" ? "bg-emerald-400" : state === "error" || state === "expired" ? "bg-rose-400" : state === "not-configured" ? "bg-slate-600" : "bg-amber-400"; return <button key={id} type="button" onClick={onOpenSessions} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"><span className={`h-1.5 w-1.5 rounded-full ${tone}`} /><SourceBadge source={id} compact /><span className="truncate">{sourceLabel(id)}</span></button>; })}</div>;
}
function applyStateEvent(current: LoadBoardSummary[], event: LoadBoardStateEvent): LoadBoardSummary[] { return current.map((board) => board.id === event.browser.boardId ? { ...board, browser: event.browser, connection: event.connection } : board); }
function useCommandShortcut(onOpen: () => void): void { useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); onOpen(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onOpen]); }
function readTheme(): "dark" | "light" { return window.localStorage.getItem("haulflow-theme") === "light" ? "light" : "dark"; }
