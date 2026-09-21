import { contextBridge, ipcRenderer, webFrame } from "electron";
import type { CarHaulerApi } from "@shared/contracts/ipc";

const api: CarHaulerApi = {
  ui: {
    setZoomFactor: (factor) => {
      const safeFactor = Math.min(1.3, Math.max(0.8, factor));
      webFrame.setZoomFactor(safeFactor);
      return webFrame.getZoomFactor();
    }
  },
  dashboard: {
    getSummary: () => ipcRenderer.invoke("dashboard:getSummary")
  },
  loads: {
    search: (filters) => ipcRenderer.invoke("loads:search", filters),
    listSavedSearches: () => ipcRenderer.invoke("loads:listSavedSearches"),
    saveSearch: (input) => ipcRenderer.invoke("loads:saveSearch", input),
    deleteSavedSearch: (id) => ipcRenderer.invoke("loads:deleteSavedSearch", id),
    listSavedLoads: () => ipcRenderer.invoke("loads:listSavedLoads"),
    saveLoad: (input) => ipcRenderer.invoke("loads:saveLoad", input),
    deleteSavedLoad: (id) => ipcRenderer.invoke("loads:deleteSavedLoad", id)
  },
  alerts: {
    list: () => ipcRenderer.invoke("alerts:list"),
    save: (input) => ipcRenderer.invoke("alerts:save", input),
    setEnabled: (id, enabled) => ipcRenderer.invoke("alerts:setEnabled", { id, enabled }),
    delete: (id) => ipcRenderer.invoke("alerts:delete", id),
    listEvents: () => ipcRenderer.invoke("alerts:listEvents"),
    getRefreshSettings: () => ipcRenderer.invoke("alerts:getRefreshSettings"),
    saveRefreshSettings: (settings) => ipcRenderer.invoke("alerts:saveRefreshSettings", settings),
    refreshNow: () => ipcRenderer.invoke("alerts:refreshNow"),
    getRefreshStatus: () => ipcRenderer.invoke("alerts:getRefreshStatus")
  },
  locations: {
    getStatus: () => ipcRenderer.invoke("locations:getStatus"),
    autocomplete: (request) => ipcRenderer.invoke("locations:autocomplete", request),
    resolve: (request) => ipcRenderer.invoke("locations:resolve", request)
  },
  loadBoards: {
    list: () => ipcRenderer.invoke("loadBoards:list"),
    open: (boardId, bounds) => ipcRenderer.invoke("loadBoards:open", { boardId, bounds }),
    resize: (boardId, bounds) => ipcRenderer.invoke("loadBoards:resize", { boardId, bounds }),
    close: (boardId) => ipcRenderer.invoke("loadBoards:close", boardId),
    navigate: (boardId, action) =>
      ipcRenderer.invoke("loadBoards:navigate", { boardId, action }),
    clearSession: (boardId) => ipcRenderer.invoke("loadBoards:clearSession", boardId),
    listObservedEndpoints: (boardId) =>
      ipcRenderer.invoke("loadBoards:listObservedEndpoints", boardId),
    onStateChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof listener>[0]) => {
        listener(payload);
      };
      ipcRenderer.on("loadBoards:stateChanged", handler);
      return () => ipcRenderer.removeListener("loadBoards:stateChanged", handler);
    }
  },
  routeMap: {
    open: (request) => ipcRenderer.invoke("routeMap:open", request),
    openExternal: (origin, destination) => ipcRenderer.invoke("routeMap:openExternal", { origin, destination }),
    resize: (bounds) => ipcRenderer.invoke("routeMap:resize", bounds),
    close: () => ipcRenderer.invoke("routeMap:close"),
    navigate: (action) => ipcRenderer.invoke("routeMap:navigate", action),
    onStateChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => {
        listener(state);
      };
      ipcRenderer.on("routeMap:stateChanged", handler);
      return () => ipcRenderer.removeListener("routeMap:stateChanged", handler);
    }
  },
  database: {
    getStatus: () => ipcRenderer.invoke("database:getStatus")
  }
};

contextBridge.exposeInMainWorld("carHauler", api);
