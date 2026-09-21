import type {
  LoadBoardBrowserState,
  LoadBoardId,
  LoadBoardStateEvent,
  LoadBoardSummary,
  ObservedLoadBoardEndpoint
} from "../types/load-board";
import type { Load } from "../types/load";
import type { SearchFilters } from "../types/search-filters";
import type { SavedSearch, SavedSearchInput } from "../types/saved-search";
import type { SavedLoad, SavedLoadInput } from "../types/saved-load";
import type { AlertRule, AlertRuleInput } from "../types/alert-rule";
import type { AlertEvent } from "../types/alert-event";
import type { AlertRefreshSettings, AlertRefreshStatus } from "../types/alert-refresh-settings";
import type {
  LocationAutocompleteRequest,
  LocationAutocompleteResult,
  LocationResolveRequest,
  LocationSearchStatus,
  LocationSelection
} from "../types/location-search";
import type {
  RouteMapBrowserAction,
  RouteMapBrowserRequest,
  RouteMapBrowserState
} from "../types/route-map-browser";

export interface DatabaseStatus {
  engine: "sqlite";
  mode: "ready" | "unavailable";
  path: string;
  message: string;
}

export interface DashboardSummary {
  availableLoads: number;
  connectedBoards: number;
  configuredBoards: number;
  sampleData: boolean;
  lastUpdatedAt: string;
}

export interface LoadSearchResult {
  loads: Load[];
  total: number;
  warnings: string[];
  refreshedAt: string;
  duplicatesRemoved: number;
  sourceCounts: Partial<Record<LoadBoardId, number>>;
}

export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LoadBoardBrowserAction = "back" | "forward" | "reload" | "home";

/** The complete, intentionally narrow API available to renderer code. */
export interface CarHaulerApi {
  ui: {
    setZoomFactor: (factor: number) => number;
  };
  dashboard: {
    getSummary: () => Promise<DashboardSummary>;
  };
  loads: {
    search: (filters: SearchFilters) => Promise<LoadSearchResult>;
    listSavedSearches: () => Promise<SavedSearch[]>;
    saveSearch: (input: SavedSearchInput) => Promise<SavedSearch>;
    deleteSavedSearch: (id: string) => Promise<void>;
    listSavedLoads: () => Promise<SavedLoad[]>;
    saveLoad: (input: SavedLoadInput) => Promise<SavedLoad>;
    deleteSavedLoad: (id: string) => Promise<void>;
  };
  alerts: {
    list: () => Promise<AlertRule[]>;
    save: (input: AlertRuleInput) => Promise<AlertRule>;
    setEnabled: (id: string, enabled: boolean) => Promise<AlertRule>;
    delete: (id: string) => Promise<void>;
    listEvents: () => Promise<AlertEvent[]>;
    getRefreshSettings: () => Promise<AlertRefreshSettings>;
    saveRefreshSettings: (settings: AlertRefreshSettings) => Promise<AlertRefreshSettings>;
    refreshNow: () => Promise<void>;
    getRefreshStatus: () => Promise<AlertRefreshStatus>;
  };
  locations: {
    getStatus: () => Promise<LocationSearchStatus>;
    autocomplete: (request: LocationAutocompleteRequest) => Promise<LocationAutocompleteResult>;
    resolve: (request: LocationResolveRequest) => Promise<LocationSelection>;
  };
  loadBoards: {
    list: () => Promise<LoadBoardSummary[]>;
    open: (boardId: LoadBoardId, bounds: BrowserViewBounds) => Promise<LoadBoardBrowserState>;
    resize: (boardId: LoadBoardId, bounds: BrowserViewBounds) => Promise<void>;
    close: (boardId: LoadBoardId) => Promise<void>;
    navigate: (
      boardId: LoadBoardId,
      action: LoadBoardBrowserAction
    ) => Promise<LoadBoardBrowserState>;
    clearSession: (boardId: LoadBoardId) => Promise<LoadBoardStateEvent>;
    listObservedEndpoints: (boardId: LoadBoardId) => Promise<ObservedLoadBoardEndpoint[]>;
    onStateChanged: (listener: (event: LoadBoardStateEvent) => void) => () => void;
  };
  routeMap: {
    open: (request: RouteMapBrowserRequest) => Promise<RouteMapBrowserState>;
    openExternal: (origin: import("../types/load").Location, destination: import("../types/load").Location) => Promise<void>;
    resize: (bounds: BrowserViewBounds) => Promise<void>;
    close: () => Promise<void>;
    navigate: (action: RouteMapBrowserAction) => Promise<RouteMapBrowserState>;
    onStateChanged: (listener: (state: RouteMapBrowserState) => void) => () => void;
  };
  database: {
    getStatus: () => Promise<DatabaseStatus>;
  };
}
