import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import type { LoadAggregationService } from "@backend/application/load-aggregation.service";
import type { AlertService } from "@backend/application/alert-service";
import type { AlertRefreshManager } from "../alert-refresh-manager";
import type { GoogleLocationSearchService } from "@backend/application/google-location-search.service";
import type { LoadBoardRegistry } from "@backend/adapters/load-board-registry";
import type { SqliteDatabase } from "@backend/database/sqlite-database";
import {
  browserViewBoundsSchema,
  loadBoardBrowserActionSchema,
  loadBoardBrowserRequestSchema
} from "@shared/types/load-board-browser";
import { loadBoardIdSchema } from "@shared/types/load-board";
import { searchFiltersSchema } from "@shared/types/search-filters";
import { savedSearchInputSchema } from "@shared/types/saved-search";
import { savedLoadInputSchema } from "@shared/types/saved-load";
import type { SavedLoadInput } from "@shared/types/saved-load";
import { alertRuleInputSchema } from "@shared/types/alert-rule";
import { alertRefreshSettingsSchema } from "@shared/types/alert-refresh-settings";
import {
  locationAutocompleteRequestSchema,
  locationResolveRequestSchema
} from "@shared/types/location-search";
import {
  routeMapBrowserActionSchema,
  routeMapBrowserRequestSchema
} from "@shared/types/route-map-browser";
import type { LoadBoardSessionManager } from "../session/load-board-session-manager";
import type { RouteMapBrowserManager } from "../session/route-map-browser-manager";

interface IpcDependencies {
  aggregationService: LoadAggregationService;
  alertService: AlertService;
  alertRefreshManager: AlertRefreshManager;
  locationSearchService: GoogleLocationSearchService;
  loadBoardRegistry: LoadBoardRegistry;
  loadBoardSessionManager: LoadBoardSessionManager;
  routeMapBrowserManager: RouteMapBrowserManager;
  database: SqliteDatabase;
}

export function registerIpcHandlers({
  aggregationService,
  alertService,
  alertRefreshManager,
  locationSearchService,
  loadBoardRegistry,
  loadBoardSessionManager,
  routeMapBrowserManager,
  database
}: IpcDependencies): void {
  ipcMain.handle("dashboard:getSummary", async () => {
    const boards = await loadBoardSessionManager.listBoards(await loadBoardRegistry.list());
    return aggregationService.getDashboardSummary(boards);
  });

  ipcMain.handle("loads:search", async (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    const result = searchFiltersSchema.safeParse(payload ?? {});
    if (!result.success) {
      throw new Error("The load search filters were invalid.");
    }

    const loads = await aggregationService.search(result.data);
    await alertService.evaluateLoads(loads.loads);
    return loads;
  });

  ipcMain.handle("loads:listSavedSearches", (event) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.listSavedSearches();
  });

  ipcMain.handle("loads:saveSearch", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.saveSearch(savedSearchInputSchema.parse(payload));
  });

  ipcMain.handle("loads:deleteSavedSearch", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.deleteSavedSearch(z.string().uuid().parse(payload));
  });

  ipcMain.handle("loads:listSavedLoads", (event) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.listSavedLoads();
  });

  ipcMain.handle("loads:saveLoad", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.saveLoad(savedLoadInputSchema.parse(payload) as SavedLoadInput);
  });

  ipcMain.handle("loads:deleteSavedLoad", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.deleteSavedLoad(z.string().min(1).parse(payload));
  });

  ipcMain.handle("alerts:list", (event) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.listAlertRules();
  });

  ipcMain.handle("alerts:save", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.saveAlertRule(alertRuleInputSchema.parse(payload));
  });

  ipcMain.handle("alerts:setEnabled", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    const input = z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(payload);
    return database.setAlertRuleEnabled(input.id, input.enabled);
  });

  ipcMain.handle("alerts:delete", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.deleteAlertRule(z.string().uuid().parse(payload));
  });

  ipcMain.handle("alerts:listEvents", (event) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.listAlertEvents();
  });

  ipcMain.handle("alerts:getRefreshSettings", (event) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return database.getAlertRefreshSettings();
  });

  ipcMain.handle("alerts:saveRefreshSettings", async (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    const settings = await database.saveAlertRefreshSettings(alertRefreshSettingsSchema.parse(payload));
    alertRefreshManager.configure(settings);
    return settings;
  });

  ipcMain.handle("alerts:refreshNow", async (event) => {
    assertTrustedSender(event, loadBoardSessionManager);
    await alertRefreshManager.refresh();
  });

  ipcMain.handle("alerts:getRefreshStatus", (event) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return alertRefreshManager.getStatus();
  });

  ipcMain.handle("locations:getStatus", (event) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return locationSearchService.getStatus();
  });

  ipcMain.handle("locations:autocomplete", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return locationSearchService.autocomplete(locationAutocompleteRequestSchema.parse(payload));
  });

  ipcMain.handle("locations:resolve", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return locationSearchService.resolve(locationResolveRequestSchema.parse(payload));
  });

  ipcMain.handle("loadBoards:list", async () => {
    const boards = await loadBoardSessionManager.listBoards(await loadBoardRegistry.list());
    await alertService.evaluateBoardHealth(boards);
    return boards;
  });

  ipcMain.handle("loadBoards:open", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    const request = loadBoardBrowserRequestSchema.parse(payload);
    return loadBoardSessionManager.open(request.boardId, request.bounds);
  });

  ipcMain.handle("loadBoards:resize", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    const request = loadBoardBrowserRequestSchema.parse(payload);
    loadBoardSessionManager.resize(request.boardId, request.bounds);
  });

  ipcMain.handle("loadBoards:close", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return loadBoardSessionManager.close(loadBoardIdSchema.parse(payload));
  });

  ipcMain.handle("loadBoards:navigate", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    const request = loadBoardBrowserActionSchema.parse(payload);
    return loadBoardSessionManager.navigate(request.boardId, request.action);
  });

  ipcMain.handle("loadBoards:clearSession", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return loadBoardSessionManager.clearSession(loadBoardIdSchema.parse(payload));
  });

  ipcMain.handle("loadBoards:listObservedEndpoints", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return loadBoardSessionManager.listObservedEndpoints(loadBoardIdSchema.parse(payload));
  });

  ipcMain.handle("routeMap:open", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    const request = routeMapBrowserRequestSchema.parse(payload);
    return routeMapBrowserManager.open(request.origin, request.destination, request.bounds);
  });

  ipcMain.handle("routeMap:openExternal", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    const request = routeMapBrowserRequestSchema
      .pick({ origin: true, destination: true })
      .parse(payload);
    return routeMapBrowserManager.openExternal(request.origin, request.destination);
  });

  ipcMain.handle("routeMap:resize", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    routeMapBrowserManager.resize(browserViewBoundsSchema.parse(payload));
  });

  ipcMain.handle("routeMap:close", (event) => {
    assertTrustedSender(event, loadBoardSessionManager);
    routeMapBrowserManager.close();
  });

  ipcMain.handle("routeMap:navigate", (event, payload: unknown) => {
    assertTrustedSender(event, loadBoardSessionManager);
    return routeMapBrowserManager.navigate(routeMapBrowserActionSchema.parse(payload));
  });

  ipcMain.handle("database:getStatus", () => database.getStatus());
}

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  sessionManager: LoadBoardSessionManager
): void {
  if (!sessionManager.isTrustedSender(event.sender)) {
    throw new Error("This action is only available to the trusted app renderer.");
  }
}
