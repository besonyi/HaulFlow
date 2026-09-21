import type {
  CarHaulerApi,
  DashboardSummary,
  DatabaseStatus,
  LoadSearchResult
} from "@shared/contracts/ipc";
import type { LoadBoardSummary } from "@shared/types/load-board";
import type { SearchFilters } from "@shared/types/search-filters";
import type { SavedSearch } from "@shared/types/saved-search";
import type { SavedLoad } from "@shared/types/saved-load";

function unavailable(message: string): never {
  throw new Error(message);
}

const browserFallback: CarHaulerApi = {
  ui: {
    setZoomFactor: (factor) => factor
  },
  dashboard: {
    getSummary: async (): Promise<DashboardSummary> =>
      unavailable("Open this screen through the Electron desktop app to access local data.")
  },
  loads: {
    search: async (_filters: SearchFilters): Promise<LoadSearchResult> =>
      unavailable("Open this screen through the Electron desktop app to access local data."),
    listSavedSearches: async (): Promise<SavedSearch[]> =>
      unavailable("Open this screen through the Electron desktop app to access saved searches."),
    saveSearch: async () =>
      unavailable("Open this screen through the Electron desktop app to save searches."),
    deleteSavedSearch: async () =>
      unavailable("Open this screen through the Electron desktop app to delete saved searches."),
    listSavedLoads: async (): Promise<SavedLoad[]> =>
      unavailable("Open this screen through the Electron desktop app to access saved loads."),
    saveLoad: async () =>
      unavailable("Open this screen through the Electron desktop app to save loads."),
    deleteSavedLoad: async () =>
      unavailable("Open this screen through the Electron desktop app to delete saved loads.")
  },
  alerts: {
    list: async () => unavailable("Open this screen through the Electron desktop app to manage alerts."),
    save: async () => unavailable("Open this screen through the Electron desktop app to manage alerts."),
    setEnabled: async () => unavailable("Open this screen through the Electron desktop app to manage alerts."),
    delete: async () => unavailable("Open this screen through the Electron desktop app to manage alerts."),
    listEvents: async () => unavailable("Open this screen through the Electron desktop app to manage alerts."),
    getRefreshSettings: async () => unavailable("Open this screen through the Electron desktop app to manage alerts."),
    saveRefreshSettings: async () => unavailable("Open this screen through the Electron desktop app to manage alerts."),
    refreshNow: async () => unavailable("Open this screen through the Electron desktop app to manage alerts."),
    getRefreshStatus: async () => unavailable("Open this screen through the Electron desktop app to manage alerts.")
  },
  locations: {
    getStatus: async () => ({
      provider: "local",
      googleConfigured: false,
      message: "Local U.S. city and ZIP suggestions are active."
    }),
    autocomplete: async () => ({ provider: "unavailable", suggestions: [] }),
    resolve: async () =>
      unavailable("Open this screen through the Electron desktop app to use Google Places.")
  },
  loadBoards: {
    list: async (): Promise<LoadBoardSummary[]> =>
      unavailable("Open this screen through the Electron desktop app to access local data."),
    open: async () =>
      unavailable("Open this screen through the Electron desktop app to use provider sessions."),
    resize: async () =>
      unavailable("Open this screen through the Electron desktop app to use provider sessions."),
    close: async () =>
      unavailable("Open this screen through the Electron desktop app to use provider sessions."),
    navigate: async () =>
      unavailable("Open this screen through the Electron desktop app to use provider sessions."),
    clearSession: async () =>
      unavailable("Open this screen through the Electron desktop app to use provider sessions."),
    listObservedEndpoints: async () =>
      unavailable("Open this screen through the Electron desktop app to inspect session endpoints."),
    onStateChanged: () => () => undefined
  },
  routeMap: {
    open: async () => unavailable("Open this screen through the Electron desktop app to view a route."),
    openExternal: async () => unavailable("Open this screen through the Electron desktop app to view a route."),
    resize: async () => unavailable("Open this screen through the Electron desktop app to view a route."),
    close: async () => unavailable("Open this screen through the Electron desktop app to view a route."),
    navigate: async () => unavailable("Open this screen through the Electron desktop app to view a route."),
    onStateChanged: () => () => undefined
  },
  database: {
    getStatus: async (): Promise<DatabaseStatus> =>
      unavailable("Open this screen through the Electron desktop app to access local data.")
  }
};

/** Renderer-only access point; Electron and Node APIs never reach UI modules. */
export const desktopApi = window.carHauler ?? browserFallback;
