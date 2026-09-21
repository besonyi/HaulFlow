import { BrowserWindow, WebContentsView, shell, type WebContents } from "electron";
import { lookup as lookupZipCode } from "zipcodes";
import type { BrowserViewBounds } from "@shared/contracts/ipc";
import type { Location } from "@shared/types/load";
import type { RouteMapBrowserAction, RouteMapBrowserState } from "@shared/types/route-map-browser";

const stateChangedChannel = "routeMap:stateChanged";

export class RouteMapBrowserManager {
  private mainWindow?: BrowserWindow;
  private view?: WebContentsView;
  private fallbackTimer?: NodeJS.Timeout;
  private state: RouteMapBrowserState = {
    isLoading: false,
    canGoBack: false,
    canGoForward: false
  };

  attachWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    window.once("closed", () => {
      if (this.mainWindow === window) {
        this.dispose();
        this.mainWindow = undefined;
      }
    });
  }

  async open(origin: Location, destination: Location, bounds: BrowserViewBounds): Promise<RouteMapBrowserState> {
    const url = createDirectionsUrl(origin, destination);
    const window = this.getWindow();

    if (!this.view) {
      this.view = new WebContentsView({
        webPreferences: {
          partition: "persist:car-hauler-route-maps",
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false
        }
      });
      this.configureWebContents(this.view.webContents);
      window.contentView.addChildView(this.view);
    }

    this.clearFallbackTimer();
    this.state = { ...this.state, isLoading: true, fallback: false, error: undefined };
    this.view.setBounds(this.sanitizeBounds(bounds));
    this.emitState();
    void this.view.webContents.loadURL(url).catch(() => {
      this.activateFallback();
    });
    this.fallbackTimer = setTimeout(() => this.activateFallback(), 7_000);
    return this.getState();
  }

  async openExternal(origin: Location, destination: Location): Promise<void> {
    await shell.openExternal(createDirectionsUrl(origin, destination));
  }

  resize(bounds: BrowserViewBounds): void {
    if (this.view) this.view.setBounds(this.sanitizeBounds(bounds));
  }

  close(): void {
    this.clearFallbackTimer();
    if (!this.view) {
      this.state = { isLoading: false, canGoBack: false, canGoForward: false };
      this.emitState();
      return;
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.contentView.removeChildView(this.view);
    }
    if (!this.view.webContents.isDestroyed()) {
      this.view.webContents.close({ waitForBeforeUnload: false });
    }
    this.view = undefined;
    this.state = { isLoading: false, canGoBack: false, canGoForward: false };
    this.emitState();
  }

  navigate(action: RouteMapBrowserAction): RouteMapBrowserState {
    const contents = this.view?.webContents;
    // The renderer can dispatch a final toolbar action while a route is closing
    // or while its offline preview is displayed. That is a harmless no-op.
    if (!contents || contents.isDestroyed()) return this.getState();
    const history = contents.navigationHistory;
    if (action === "back" && history.canGoBack()) history.goBack();
    if (action === "forward" && history.canGoForward()) history.goForward();
    if (action === "reload") contents.reload();
    return this.getState();
  }

  dispose(): void {
    this.close();
  }

  private configureWebContents(contents: WebContents): void {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (details) => {
      if (!isOpenStreetMapUrl(details.url)) details.preventDefault();
    });
    contents.on("did-start-loading", () => {
      this.state = { ...this.state, isLoading: true, error: undefined };
      this.emitState();
    });
    contents.on("did-stop-loading", () => {
      this.clearFallbackTimer();
      this.state = {
        ...this.state,
        isLoading: false,
        fallback: false,
        currentUrl: contents.getURL() || undefined
      };
      this.emitState();
    });
    contents.on("did-navigate", (_event, url) => this.updateNavigationState(contents, url));
    contents.on("did-navigate-in-page", (_event, url) => this.updateNavigationState(contents, url));
    contents.on("did-fail-load", (_event, errorCode, errorDescription, url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      this.state = { ...this.state, currentUrl: url, error: errorDescription };
      this.activateFallback();
    });
  }

  private activateFallback(): void {
    if (this.state.fallback) return;
    this.clearFallbackTimer();
    if (this.view) {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.contentView.removeChildView(this.view);
      }
      if (!this.view.webContents.isDestroyed()) {
        this.view.webContents.close({ waitForBeforeUnload: false });
      }
      this.view = undefined;
    }
    this.state = {
      ...this.state,
      isLoading: false,
      fallback: true,
      canGoBack: false,
      canGoForward: false,
      error: undefined
    };
    this.emitState();
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = undefined;
  }

  private updateNavigationState(contents: WebContents, url: string): void {
    const history = contents.navigationHistory;
    this.state = {
      ...this.state,
      currentUrl: url,
      canGoBack: history.canGoBack(),
      canGoForward: history.canGoForward()
    };
    this.emitState();
  }

  private getState(): RouteMapBrowserState {
    const contents = this.view?.webContents;
    const history = contents?.navigationHistory;
    return {
      ...this.state,
      canGoBack: history?.canGoBack() ?? false,
      canGoForward: history?.canGoForward() ?? false
    };
  }

  private emitState(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(stateChangedChannel, this.getState());
    }
  }

  private sanitizeBounds(bounds: BrowserViewBounds): BrowserViewBounds {
    const [contentWidth, contentHeight] = this.getWindow().getContentSize();
    const x = Math.min(Math.max(0, Math.round(bounds.x)), Math.max(0, contentWidth - 320));
    const y = Math.min(Math.max(0, Math.round(bounds.y)), Math.max(0, contentHeight - 240));
    const width = Math.max(320, Math.min(Math.round(bounds.width), contentWidth - x));
    const height = Math.max(240, Math.min(Math.round(bounds.height), contentHeight - y));
    return { x, y, width, height };
  }

  private getWindow(): BrowserWindow {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error("The desktop window is not available.");
    }
    return this.mainWindow;
  }
}

function createDirectionsUrl(origin: Location, destination: Location): string {
  const originCoordinates = locationCoordinates(origin);
  const destinationCoordinates = locationCoordinates(destination);
  if (!originCoordinates || !destinationCoordinates) {
    throw new Error("A ZIP code or coordinates are required for both pickup and delivery to view the route.");
  }

  const url = new URL("https://www.openstreetmap.org/directions");
  url.searchParams.set("engine", "fossgis_osrm_car");
  url.searchParams.set(
    "route",
    `${originCoordinates.latitude},${originCoordinates.longitude};${destinationCoordinates.latitude},${destinationCoordinates.longitude}`
  );
  return url.toString();
}

function locationCoordinates(location: Location): { latitude: number; longitude: number } | undefined {
  if (location.latitude !== undefined && location.longitude !== undefined) {
    return { latitude: location.latitude, longitude: location.longitude };
  }
  const zipCode = location.postalCode ? lookupZipCode(location.postalCode) : undefined;
  return zipCode ? { latitude: zipCode.latitude, longitude: zipCode.longitude } : undefined;
}

function isOpenStreetMapUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "openstreetmap.org" || url.hostname.endsWith(".openstreetmap.org"));
  } catch {
    return false;
  }
}
