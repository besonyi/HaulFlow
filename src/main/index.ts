import { app, BrowserWindow, Notification, shell } from "electron";
import { createRequire } from "node:module";
import { join } from "node:path";
import { CentralDispatchAdapter } from "@backend/adapters/central-dispatch/central-dispatch.adapter";
import { LoadBoardRegistry } from "@backend/adapters/load-board-registry";
import { ShipCarsAdapter } from "@backend/adapters/ship-cars/ship-cars.adapter";
import { SuperDispatchAdapter } from "@backend/adapters/super-dispatch/super-dispatch.adapter";
import { SessionSearchGateway } from "@backend/adapters/session-search-client";
import { LoadAggregationService } from "@backend/application/load-aggregation.service";
import { AlertService } from "@backend/application/alert-service";
import { GoogleLocationSearchService } from "@backend/application/google-location-search.service";
import { SqliteDatabase } from "@backend/database/sqlite-database";
import { InMemoryLoadRepository } from "@backend/repositories/in-memory-load.repository";
import { registerIpcHandlers } from "./ipc/register-handlers";
import { LoadBoardSessionManager } from "./session/load-board-session-manager";
import { RouteMapBrowserManager } from "./session/route-map-browser-manager";
import { AlertRefreshManager } from "./alert-refresh-manager";

let mainWindow: BrowserWindow | undefined;
let quitFlushInProgress = false;
let sessionsFlushedForQuit = false;

const require = createRequire(import.meta.url);
const sqliteWasmPath = app.isPackaged
  ? join(process.resourcesPath, "sql-wasm.wasm")
  : require.resolve("sql.js/dist/sql-wasm.wasm");
const database = new SqliteDatabase(
  join(app.getPath("userData"), "car-hauler.sqlite"),
  sqliteWasmPath
);
const sessionSearchGateway = new SessionSearchGateway();
const loadBoardRegistry = new LoadBoardRegistry([
  new CentralDispatchAdapter(sessionSearchGateway),
  new SuperDispatchAdapter(sessionSearchGateway),
  new ShipCarsAdapter(sessionSearchGateway)
]);
const loadBoardSessionManager = new LoadBoardSessionManager(
  loadBoardRegistry.getBrowserConfigurations(),
  database
);
sessionSearchGateway.connect((boardId, filters) =>
  loadBoardSessionManager.fetchSessionSearch(boardId, filters)
);
const aggregationService = new LoadAggregationService(
  new InMemoryLoadRepository(),
  loadBoardRegistry,
  database
);
const alertService = new AlertService(database, (event) => {
  if (Notification.isSupported()) {
    new Notification({ title: event.title, body: event.message, silent: false }).show();
  }
});
const alertRefreshManager = new AlertRefreshManager(aggregationService, alertService, async () =>
  loadBoardSessionManager.listBoards(await loadBoardRegistry.list())
);
const locationSearchService = new GoogleLocationSearchService();
const routeMapBrowserManager = new RouteMapBrowserManager();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    title: "Car Hauler Load Aggregator",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("close", () => {
    void loadBoardSessionManager.flushAll();
  });
  loadBoardSessionManager.attachWindow(mainWindow);
  routeMapBrowserManager.attachWindow(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  await database.initialize();
  registerIpcHandlers({
    aggregationService,
    alertService,
    alertRefreshManager,
    locationSearchService,
    loadBoardRegistry,
    loadBoardSessionManager,
    routeMapBrowserManager,
    database
  });
  alertRefreshManager.configure(await database.getAlertRefreshSettings());
  createWindow();

  if (process.env.CAR_HAULER_CAPTURE_SCHEMAS === "1") {
    void loadBoardSessionManager.captureSessionEndpointSchemas();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (sessionsFlushedForQuit) return;
  event.preventDefault();
  if (quitFlushInProgress) return;

  quitFlushInProgress = true;
  void Promise.all([loadBoardSessionManager.dispose(), database.close()]).finally(() => {
    alertRefreshManager.stop();
    routeMapBrowserManager.dispose();
    sessionsFlushedForQuit = true;
    app.quit();
  });
});
