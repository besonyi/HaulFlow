/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import type { LoadSearchResult } from "@shared/contracts/ipc";
import type { Load } from "@shared/types/load";
import type { LoadBoardId } from "@shared/types/load-board";
import type { SearchFilters } from "@shared/types/search-filters";
import { desktopApi } from "@/api/client";

export type FilterSyncPhase =
  | "idle"
  | "awaiting-selection"
  | "syncing"
  | "synced"
  | "failed";

export interface FilterSyncStatus {
  phase: FilterSyncPhase;
  message: string;
  updatedAt?: string;
}

type FilterSyncBySource = Record<LoadBoardId, FilterSyncStatus>;

interface LoadWorkspaceValue {
  result?: LoadSearchResult;
  appliedFilters?: SearchFilters;
  selectedLoad?: Load;
  filterSync: FilterSyncBySource;
  error?: string;
  isSearching: boolean;
  setSelectedLoad: (load?: Load) => void;
  markCentralAwaitingSelection: (message: string) => void;
  runSearch: (filters: SearchFilters) => Promise<LoadSearchResult | undefined>;
}

const sourceIds: LoadBoardId[] = ["central-dispatch", "super-dispatch", "ship-cars"];

const idleStatuses = (): FilterSyncBySource => ({
  "central-dispatch": { phase: "idle", message: "Waiting for a search" },
  "super-dispatch": { phase: "idle", message: "Waiting for a search" },
  "ship-cars": { phase: "idle", message: "Waiting for a search" }
});

const LoadWorkspaceContext = createContext<LoadWorkspaceValue | undefined>(undefined);

export function LoadWorkspaceProvider({ children }: PropsWithChildren): JSX.Element {
  const [result, setResult] = useState<LoadSearchResult>();
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>();
  const [selectedLoad, setSelectedLoad] = useState<Load>();
  const [filterSync, setFilterSync] = useState<FilterSyncBySource>(idleStatuses);
  const [error, setError] = useState<string>();
  const [isSearching, setIsSearching] = useState(false);

  const markCentralAwaitingSelection = useCallback((message: string) => {
    setFilterSync((current) => ({
      ...current,
      "central-dispatch": { phase: "awaiting-selection", message, updatedAt: new Date().toISOString() }
    }));
  }, []);

  const runSearch = useCallback(async (filters: SearchFilters): Promise<LoadSearchResult | undefined> => {
    const sources = filters.sources?.length ? filters.sources : sourceIds;
    setAppliedFilters(filters);
    setIsSearching(true);
    setError(undefined);
    setFilterSync((current) => {
      const next = { ...current };
      sourceIds.forEach((source) => {
        next[source] = sources.includes(source)
          ? { phase: "syncing", message: "Applying unified filter…", updatedAt: new Date().toISOString() }
          : { phase: "idle", message: "Not included in this search" };
      });
      return next;
    });

    try {
      const nextResult = await desktopApi.loads.search(filters);
      const updatedAt = new Date().toISOString();
      setResult(nextResult);
      setSelectedLoad((current) =>
        current ? nextResult.loads.find((load) => load.id === current.id) ?? nextResult.loads[0] : nextResult.loads[0]
      );
      setFilterSync((current) => {
        const next = { ...current };
        sourceIds.forEach((source) => {
          if (!sources.includes(source)) return;
          const sourceName = source === "central-dispatch" ? "Central Dispatch" : source === "super-dispatch" ? "Super Dispatch" : "Ship.Cars";
          const warning = nextResult.warnings.find((item) => item.startsWith(`${sourceName}:`));
          next[source] = warning && !isInformationalFilterWarning(warning)
            ? { phase: "failed", message: warning.replace(`${sourceName}: `, ""), updatedAt }
            : { phase: "synced", message: warning ? warning.replace(`${sourceName}: `, "") : "Unified filter applied", updatedAt };
        });
        return next;
      });
      return nextResult;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not refresh the live load feed.";
      setError(message);
      setFilterSync((current) => {
        const next = { ...current };
        sources.forEach((source) => {
          next[source] = { phase: "failed", message, updatedAt: new Date().toISOString() };
        });
        return next;
      });
      return undefined;
    } finally {
      setIsSearching(false);
    }
  }, []);

  const value = useMemo<LoadWorkspaceValue>(
    () => ({
      result,
      appliedFilters,
      selectedLoad,
      filterSync,
      error,
      isSearching,
      setSelectedLoad,
      markCentralAwaitingSelection,
      runSearch
    }),
    [appliedFilters, error, filterSync, isSearching, markCentralAwaitingSelection, result, runSearch, selectedLoad]
  );

  return <LoadWorkspaceContext.Provider value={value}>{children}</LoadWorkspaceContext.Provider>;
}

function isInformationalFilterWarning(message: string): boolean {
  return message.includes("finalized locally after the session search");
}

export function useLoadWorkspace(): LoadWorkspaceValue {
  const context = useContext(LoadWorkspaceContext);
  if (!context) throw new Error("useLoadWorkspace must be used inside LoadWorkspaceProvider.");
  return context;
}
