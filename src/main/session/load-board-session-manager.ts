import {
  BrowserWindow,
  net,
  session,
  WebContentsView,
  type Session,
  type WebContents
} from "electron";
import type { LoadBoardBrowserConfiguration } from "@backend/adapters/load-board-adapter";
import type { SessionSearchResponse } from "@backend/adapters/session-search-client";
import type {
  LoadBoardEndpointObservationStore,
  ObservedLoadBoardEndpoint
} from "@backend/database/load-board-endpoint-observation-store";
import type {
  LoadBoardSessionMetadata,
  LoadBoardSessionMetadataStore
} from "@backend/database/load-board-session-metadata-store";
import type { BrowserViewBounds, LoadBoardBrowserAction } from "@shared/contracts/ipc";
import type {
  LoadBoardBrowserState,
  LoadBoardConnectionStatus,
  LoadBoardId,
  LoadBoardStateEvent,
  LoadBoardSummary
} from "@shared/types/load-board";
import type { LocationFilter, SearchFilters } from "@shared/types/search-filters";

const stateChangedChannel = "loadBoards:stateChanged";

interface BrowserRuntime {
  view?: WebContentsView;
  popups: Set<BrowserWindow>;
  currentUrl?: string;
  isLoading: boolean;
  lastOpenedAt?: string;
  error?: string;
  hadStoredSession: boolean;
  wasConnected: boolean;
}

interface CapturedSessionSearch {
  boardId: LoadBoardId;
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
}

export class LoadBoardSessionManager {
  private mainWindow?: BrowserWindow;
  private activeBoardId?: LoadBoardId;
  private readonly configurations = new Map<LoadBoardId, LoadBoardBrowserConfiguration>();
  private readonly runtimes = new Map<LoadBoardId, BrowserRuntime>();
  private readonly configuredSessions = new Set<LoadBoardId>();
  private readonly hydratedMetadata = new Set<LoadBoardId>();
  private readonly recentlyObservedEndpoints = new Map<string, number>();
  private readonly pendingSearchRequests = new Map<string, CapturedSessionSearch>();
  private readonly capturedSearchRequests = new Map<LoadBoardId, CapturedSessionSearch>();
  private readonly capturesInProgress = new Map<LoadBoardId, Promise<void>>();
  private readonly replayingBoards = new Set<LoadBoardId>();

  constructor(
    configurations: LoadBoardBrowserConfiguration[],
    private readonly metadataStore: LoadBoardSessionMetadataStore & LoadBoardEndpointObservationStore
  ) {
    for (const configuration of configurations) {
      this.configurations.set(configuration.id, configuration);
      this.runtimes.set(configuration.id, {
        popups: new Set(),
        isLoading: false,
        hadStoredSession: false,
        wasConnected: false
      });
    }
  }

  attachWindow(window: BrowserWindow): void {
    this.mainWindow = window;
    window.once("closed", () => {
      if (this.mainWindow === window) {
        this.disposeViews();
        this.mainWindow = undefined;
      }
    });
  }

  async fetchSessionSearch(
    boardId: LoadBoardId,
    filters: SearchFilters
  ): Promise<SessionSearchResponse> {
    const configuration = this.getConfiguration(boardId);
    if (boardId === "central-dispatch") {
      await this.confirmCentralDispatchLocations(filters);
    }
    if (!this.capturedSearchRequests.has(boardId)) {
      await this.ensureSessionSearchCaptured(configuration);
    }
    const captured = this.capturedSearchRequests.get(boardId);
    if (!captured) {
      throw new Error("open this load board and run a search once, then refresh Loads");
    }

    const request = applySearchFilters(captured, filters);
    const payload = await this.fetchCapturedSearch(
      configuration,
      this.getProviderSession(configuration),
      request
    );
    return { payload, fetchedAt: new Date().toISOString() };
  }

  /**
   * The Search workspace only supplies Central Dispatch city filters after a
   * user selects a concrete autocomplete result.  That normalized city/state
   * pair is serialized into the provider request here.  A visible provider
   * BrowserView is not required: closing the Sessions screen must not turn a
   * valid saved provider session into a failed unified filter.
   */
  private async confirmCentralDispatchLocations(filters: SearchFilters): Promise<void> {
    const locations = [
      { filter: filters.origin, scope: "Pickup" as const },
      { filter: filters.destination, scope: "Dropoff" as const }
    ].filter((item): item is { filter: LocationFilter; scope: "Pickup" | "Dropoff" } =>
      Boolean(item.filter?.cities?.length)
    );
    if (!locations.length) return;

    for (const { filter, scope } of locations) {
      const cities = filter.cities ?? [];
      for (let index = 0; index < cities.length; index += 1) {
        const state = filter.states?.[Math.min(index, (filter.states?.length ?? 1) - 1)];
        const postalCode = filter.postalCodes?.[Math.min(index, (filter.postalCodes?.length ?? 1) - 1)];
        if (!state && !postalCode) {
          throw new Error(
            `Central Dispatch ${scope.toLowerCase()} needs an exact autocomplete choice with a state or ZIP code.`
          );
        }
      }
    }
  }

  isTrustedSender(sender: WebContents): boolean {
    return this.mainWindow?.webContents.id === sender.id;
  }

  async listBoards(boards: LoadBoardSummary[]): Promise<LoadBoardSummary[]> {
    return Promise.all(
      boards.map(async (board) => {
        await this.hydrateRuntime(board.id);
        const event = await this.getStateEvent(board.id);
        return {
          ...board,
          connection: event.connection,
          browser: event.browser,
          observedEndpointCount: (await this.metadataStore.listObservedEndpoints(board.id)).length
        };
      })
    );
  }

  async open(boardId: LoadBoardId, bounds: BrowserViewBounds): Promise<LoadBoardBrowserState> {
    const configuration = this.getConfiguration(boardId);
    const window = this.getWindow();

    if (this.activeBoardId && this.activeBoardId !== boardId) {
      await this.flushSession(this.activeBoardId);
      this.destroyView(this.activeBoardId);
    }

    const runtime = this.getRuntime(boardId);
    if (runtime.view) {
      runtime.view.setBounds(this.sanitizeBounds(bounds));
      return this.getBrowserState(boardId);
    }

    const providerSession = this.getProviderSession(configuration);
    runtime.hadStoredSession = await this.hasStoredAuthSession(configuration, providerSession);
    runtime.lastOpenedAt = new Date().toISOString();
    runtime.isLoading = true;
    runtime.error = undefined;

    const view = new WebContentsView({
      webPreferences: {
        partition: configuration.partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });

    runtime.view = view;
    this.activeBoardId = boardId;
    this.configureWebContents(boardId, view);
    window.contentView.addChildView(view);
    view.setBounds(this.sanitizeBounds(bounds));

    void view.webContents.loadURL(configuration.startUrl).catch((reason: unknown) => {
      runtime.isLoading = false;
      runtime.error = reason instanceof Error ? reason.message : "The provider page could not be loaded.";
      void this.emitState(boardId);
    });

    void this.emitState(boardId);
    return this.getBrowserState(boardId);
  }

  resize(boardId: LoadBoardId, bounds: BrowserViewBounds): void {
    const runtime = this.getRuntime(boardId);
    if (runtime.view && this.activeBoardId === boardId) {
      runtime.view.setBounds(this.sanitizeBounds(bounds));
    }
  }

  async close(boardId: LoadBoardId): Promise<void> {
    await this.flushSession(boardId);
    this.destroyView(boardId);
    await this.emitState(boardId);
  }

  async navigate(
    boardId: LoadBoardId,
    action: LoadBoardBrowserAction
  ): Promise<LoadBoardBrowserState> {
    const configuration = this.getConfiguration(boardId);
    const runtime = this.getRuntime(boardId);
    const contents = runtime.view?.webContents;
    if (!contents) throw new Error("Open the provider browser before using navigation controls.");

    const history = contents.navigationHistory;
    if (action === "back" && history.canGoBack()) history.goBack();
    if (action === "forward" && history.canGoForward()) history.goForward();
    if (action === "reload") contents.reload();
    if (action === "home") void contents.loadURL(configuration.startUrl);

    return this.getBrowserState(boardId);
  }

  async clearSession(boardId: LoadBoardId): Promise<LoadBoardStateEvent> {
    const configuration = this.getConfiguration(boardId);
    this.destroyView(boardId);

    const providerSession = this.getProviderSession(configuration);
    await providerSession.clearData();
    providerSession.flushStorageData();
    await providerSession.cookies.flushStore();

    const runtime = this.getRuntime(boardId);
    runtime.currentUrl = undefined;
    runtime.error = undefined;
    runtime.hadStoredSession = false;
    runtime.wasConnected = false;

    const event = await this.getStateEvent(boardId);
    this.sendEvent(event);
    return event;
  }

  async dispose(): Promise<void> {
    await this.flushAll();
    this.disposeViews();
  }

  async flushAll(): Promise<void> {
    await Promise.all([...this.configurations.keys()].map((boardId) => this.flushSession(boardId)));
  }

  async captureSessionEndpointSchemas(): Promise<void> {
    await Promise.all(
      [...this.configurations.values()].map((configuration) =>
        this.ensureSessionSearchCaptured(configuration)
      )
    );
  }

  listObservedEndpoints(boardId: LoadBoardId): Promise<ObservedLoadBoardEndpoint[]> {
    this.getConfiguration(boardId);
    return this.metadataStore.listObservedEndpoints(boardId);
  }

  private configureWebContents(boardId: LoadBoardId, view: WebContentsView): void {
    const configuration = this.getConfiguration(boardId);
    const contents = view.webContents;

    contents.setWindowOpenHandler(({ url }) => {
      if (!isSafeRemoteUrl(url)) return { action: "deny" };

      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1024,
          height: 780,
          minWidth: 720,
          minHeight: 560,
          autoHideMenuBar: true,
          parent: this.mainWindow,
          backgroundColor: "#ffffff",
          webPreferences: {
            partition: configuration.partition,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false
          }
        }
      };
    });

    contents.on("will-navigate", (details) => {
      if (!isSafeRemoteUrl(details.url)) details.preventDefault();
    });

    contents.on("did-create-window", (popup) => {
      const runtime = this.getRuntime(boardId);
      runtime.popups.add(popup);
      popup.once("closed", () => runtime.popups.delete(popup));
      popup.webContents.on("will-navigate", (details) => {
        if (!isSafeRemoteUrl(details.url)) details.preventDefault();
      });
    });

    contents.on("did-start-loading", () => {
      const runtime = this.getRuntime(boardId);
      runtime.isLoading = true;
      runtime.error = undefined;
      void this.emitState(boardId);
    });

    contents.on("did-stop-loading", () => {
      const runtime = this.getRuntime(boardId);
      runtime.isLoading = false;
      runtime.currentUrl = contents.getURL() || runtime.currentUrl;
      void this.flushSession(boardId);
      void this.emitState(boardId);
    });

    contents.on("did-navigate", (_event, url) => {
      this.updateCurrentUrl(boardId, url);
    });

    contents.on("did-navigate-in-page", (_event, url) => {
      this.updateCurrentUrl(boardId, url);
    });

    contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      const runtime = this.getRuntime(boardId);
      runtime.isLoading = false;
      runtime.currentUrl = validatedUrl || runtime.currentUrl;
      runtime.error = errorDescription;
      void this.emitState(boardId);
    });
  }

  private async captureSessionEndpointSchema(
    configuration: LoadBoardBrowserConfiguration
  ): Promise<void> {
    this.getProviderSession(configuration);
    const view = new WebContentsView({
      webPreferences: {
        partition: configuration.partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });

    try {
      void view.webContents.loadURL(configuration.startUrl).catch(() => undefined);
      const deadline = Date.now() + 15_000;
      while (!this.capturedSearchRequests.has(configuration.id) && Date.now() < deadline) {
        await delay(250);
      }
    } catch {
      // A provider may redirect to sign-in; the normal session UI reports that state.
    } finally {
      if (!view.webContents.isDestroyed()) {
        view.webContents.close({ waitForBeforeUnload: false });
      }
    }
  }

  private async ensureSessionSearchCaptured(
    configuration: LoadBoardBrowserConfiguration
  ): Promise<void> {
    if (this.capturedSearchRequests.has(configuration.id)) return;

    const activeCapture = this.capturesInProgress.get(configuration.id);
    if (activeCapture) {
      await activeCapture;
      return;
    }

    const capture = this.captureSessionEndpointSchema(configuration).finally(() => {
      this.capturesInProgress.delete(configuration.id);
    });
    this.capturesInProgress.set(configuration.id, capture);
    await capture;
  }

  private updateCurrentUrl(boardId: LoadBoardId, url: string): void {
    const runtime = this.getRuntime(boardId);
    runtime.currentUrl = url;
    runtime.error = undefined;
    void this.emitState(boardId);
  }

  private async getStateEvent(boardId: LoadBoardId): Promise<LoadBoardStateEvent> {
    const browser = await this.getBrowserState(boardId);
    const connection = this.getConnectionStatus(boardId, browser);
    const event = { browser, connection };
    await this.persistMetadata(event);
    return event;
  }

  private async getBrowserState(boardId: LoadBoardId): Promise<LoadBoardBrowserState> {
    const configuration = this.getConfiguration(boardId);
    const runtime = this.getRuntime(boardId);
    const providerSession = this.getProviderSession(configuration);
    const hasStoredSession = await this.hasStoredAuthSession(configuration, providerSession);

    const contents = runtime.view?.webContents;
    return {
      boardId,
      isOpen: Boolean(runtime.view),
      isLoading: runtime.isLoading,
      canGoBack: contents?.navigationHistory.canGoBack() ?? false,
      canGoForward: contents?.navigationHistory.canGoForward() ?? false,
      hasStoredSession,
      currentHost: safeHost(runtime.currentUrl),
      lastOpenedAt: runtime.lastOpenedAt,
      error: runtime.error
    };
  }

  private getConnectionStatus(
    boardId: LoadBoardId,
    browser: LoadBoardBrowserState
  ): LoadBoardConnectionStatus {
    const configuration = this.getConfiguration(boardId);
    const runtime = this.getRuntime(boardId);
    const checkedAt = new Date().toISOString();

    if (browser.error) {
      return { state: "error", checkedAt, message: browser.error };
    }

    const onLoginPage = Boolean(
      runtime.currentUrl &&
        configuration.loginUrlFragments.some((fragment) =>
          runtime.currentUrl?.toLowerCase().includes(fragment.toLowerCase())
        )
    );

    if (onLoginPage) {
      const hadSession = runtime.wasConnected || runtime.hadStoredSession;
      return {
        state: hadSession ? "expired" : "disconnected",
        checkedAt,
        message: hadSession
          ? "The saved session needs sign-in again."
          : "Sign in directly in the isolated provider browser."
      };
    }

    if (runtime.currentUrl && browser.hasStoredSession) {
      runtime.wasConnected = true;
      return {
        state: "connected",
        checkedAt,
        message: "A provider session is active in its isolated browser partition."
      };
    }

    if (browser.hasStoredSession) {
      return {
        state: "connected",
        checkedAt,
        message: "Saved sign-in found. Open this source to validate it with the provider."
      };
    }

    return {
      state: "disconnected",
      checkedAt,
      message: "No saved session. Open the secure browser to sign in."
    };
  }

  private async emitState(boardId: LoadBoardId): Promise<void> {
    this.sendEvent(await this.getStateEvent(boardId));
  }

  private async hydrateRuntime(boardId: LoadBoardId): Promise<void> {
    if (this.hydratedMetadata.has(boardId)) return;

    const metadata = await this.metadataStore.getLoadBoardSession(boardId);
    const runtime = this.getRuntime(boardId);
    if (metadata) {
      runtime.lastOpenedAt = metadata.lastOpenedAt;
      runtime.hadStoredSession = metadata.hasStoredSession;
      runtime.wasConnected = metadata.connectionState === "connected";
    }
    this.hydratedMetadata.add(boardId);
  }

  private async persistMetadata(event: LoadBoardStateEvent): Promise<void> {
    const metadata: LoadBoardSessionMetadata = {
      boardId: event.browser.boardId,
      connectionState: event.connection.state,
      hasStoredSession: event.browser.hasStoredSession,
      currentHost: event.browser.currentHost,
      lastOpenedAt: event.browser.lastOpenedAt,
      checkedAt: event.connection.checkedAt,
      updatedAt: new Date().toISOString()
    };
    await this.metadataStore.saveLoadBoardSession(metadata);
  }

  private sendEvent(event: LoadBoardStateEvent): void {
    const contents = this.mainWindow?.webContents;
    if (contents && !contents.isDestroyed()) {
      contents.send(stateChangedChannel, event);
    }
  }

  private destroyView(boardId: LoadBoardId): void {
    const runtime = this.getRuntime(boardId);
    const view = runtime.view;

    for (const popup of runtime.popups) {
      if (!popup.isDestroyed()) popup.destroy();
    }
    runtime.popups.clear();

    if (!view) return;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.contentView.removeChildView(view);
    }
    if (!view.webContents.isDestroyed()) {
      view.webContents.close({ waitForBeforeUnload: false });
    }

    runtime.view = undefined;
    runtime.isLoading = false;
    if (this.activeBoardId === boardId) this.activeBoardId = undefined;
  }

  private disposeViews(): void {
    for (const boardId of this.runtimes.keys()) this.destroyView(boardId);
  }

  private sanitizeBounds(bounds: BrowserViewBounds): BrowserViewBounds {
    const window = this.getWindow();
    const [contentWidth, contentHeight] = window.getContentSize();
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

  private getConfiguration(boardId: LoadBoardId): LoadBoardBrowserConfiguration {
    const configuration = this.configurations.get(boardId);
    if (!configuration) throw new Error("Unknown load board.");
    return configuration;
  }

  private getRuntime(boardId: LoadBoardId): BrowserRuntime {
    const runtime = this.runtimes.get(boardId);
    if (!runtime) throw new Error("Unknown load board.");
    return runtime;
  }

  private getProviderSession(configuration: LoadBoardBrowserConfiguration): Session {
    const providerSession = session.fromPartition(configuration.partition, { cache: true });
    if (!this.configuredSessions.has(configuration.id)) {
      this.configuredSessions.add(configuration.id);
      providerSession.cookies.on("changed", () => {
        void providerSession.cookies.flushStore();
      });
      providerSession.webRequest.onBeforeSendHeaders(
        { urls: ["https://*/*"], types: ["xhr"] },
        (details, callback) => {
          if (
            !this.replayingBoards.has(configuration.id) &&
            matchesSessionSearch(configuration, details.url, details.method)
          ) {
            this.pendingSearchRequests.set(requestKey(configuration.id, details.id), {
              boardId: configuration.id,
              method: configuration.sessionSearchEndpoint.method,
              url: details.url,
              headers: filterReplayHeaders(details.requestHeaders),
              body: combineUploadData(details.uploadData)
            });
          }
          callback({ requestHeaders: details.requestHeaders });
        }
      );
      providerSession.webRequest.onCompleted(
        { urls: ["https://*/*"], types: ["xhr"] },
        (details) => {
          this.observeEndpoint(configuration, details);
          const key = requestKey(configuration.id, details.id);
          const captured = this.pendingSearchRequests.get(key);
          this.pendingSearchRequests.delete(key);
          if (captured && details.statusCode >= 200 && details.statusCode < 300) {
            this.capturedSearchRequests.set(configuration.id, captured);
            void this.replayAndRecordShape(configuration, providerSession, captured);
          }
        }
      );
    }
    return providerSession;
  }

  private async hasStoredAuthSession(
    configuration: LoadBoardBrowserConfiguration,
    providerSession: Session
  ): Promise<boolean> {
    const patterns = configuration.sessionCookieNamePatterns.map((pattern) => pattern.toLowerCase());
    const cookies = await providerSession.cookies.get({});
    return cookies.some((cookie) => {
      const name = cookie.name.toLowerCase();
      return patterns.some((pattern) => name.includes(pattern));
    });
  }

  private async flushSession(boardId: LoadBoardId): Promise<void> {
    const configuration = this.getConfiguration(boardId);
    const providerSession = this.getProviderSession(configuration);
    providerSession.flushStorageData();
    await providerSession.cookies.flushStore();
  }

  private observeEndpoint(
    configuration: LoadBoardBrowserConfiguration,
    details: Electron.OnCompletedListenerDetails
  ): void {
    const observation = sanitizeEndpointObservation(configuration, details);
    if (!observation) return;

    const key = [
      observation.boardId,
      observation.method,
      observation.origin,
      observation.pathTemplate,
      observation.queryParameterNames.join(",")
    ].join("|");
    const now = Date.now();
    if (now - (this.recentlyObservedEndpoints.get(key) ?? 0) < 5_000) return;
    this.recentlyObservedEndpoints.set(key, now);

    void this.metadataStore.recordObservedEndpoint(observation).catch(() => undefined);
  }

  private async replayAndRecordShape(
    configuration: LoadBoardBrowserConfiguration,
    providerSession: Session,
    captured: CapturedSessionSearch
  ): Promise<void> {
    if (this.replayingBoards.has(configuration.id)) return;
    this.replayingBoards.add(configuration.id);
    try {
      const body = await this.fetchCapturedSearch(configuration, providerSession, captured);

      await this.metadataStore.saveEndpointResponseShape({
        boardId: captured.boardId,
        method: captured.method,
        origin: configuration.sessionSearchEndpoint.origin,
        pathTemplate: configuration.sessionSearchEndpoint.path,
        responseShape: describeJsonShape(body),
        capturedAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn(
        `Could not inspect ${configuration.displayName} session response:`,
        error instanceof Error ? error.message : "unknown replay error"
      );
    } finally {
      this.replayingBoards.delete(configuration.id);
    }
  }

  private async fetchCapturedSearch(
    configuration: LoadBoardBrowserConfiguration,
    providerSession: Session,
    captured: CapturedSessionSearch
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await providerSession.fetch(captured.url, {
        method: captured.method,
        headers: captured.headers,
        body:
          captured.method === "POST" && captured.body
            ? Uint8Array.from(captured.body)
            : undefined,
        credentials: "include",
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(
          `${configuration.displayName} session search returned HTTP ${response.status}`
        );
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("json")) {
        throw new Error(`${configuration.displayName} session search did not return JSON`);
      }
      return (await response.json()) as unknown;
    } catch (fetchError) {
      try {
        return await requestJsonWithSession(providerSession, captured);
      } catch {
        throw fetchError;
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

function requestKey(boardId: LoadBoardId, requestId: number): string {
  return `${boardId}:${requestId}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function applySearchFilters(
  captured: CapturedSessionSearch,
  filters: SearchFilters
): CapturedSessionSearch {
  if (captured.boardId === "central-dispatch") {
    return applyCentralDispatchFilters(captured, filters);
  }
  if (captured.boardId === "super-dispatch") {
    return applySuperDispatchFilters(captured, filters);
  }
  return applyShipCarsFilters(captured, filters);
}

function applyCentralDispatchFilters(
  captured: CapturedSessionSearch,
  filters: SearchFilters
): CapturedSessionSearch {
  const body: Record<string, unknown> = {
    vehicleCount: {
      min: filters.vehicleCountMin ?? 1,
      max: filters.vehicleCountMax ?? null
    },
    postedWithinHours: centralPostedWithinHours(filters.postedWithinHours),
    tagListingsPostedWithin:
      filters.centralDispatch?.tagListingsPostedWithinHours ?? 2,
    trailerTypes:
      filters.trailerType && filters.trailerType !== "all"
        ? [
            filters.trailerType === "enclosed"
              ? "ENCLOSED"
              : filters.trailerType === "driveaway"
                ? "DRIVEAWAY"
                : "OPEN"
          ]
        : [],
    paymentTypes: filters.centralDispatch?.paymentTypes ?? [],
    vehicleTypes: centralVehicleTypes(filters.vehicleTypes),
    operability:
      filters.operability === "operable"
        ? "OperableOnly"
        : filters.operability === "inoperable"
          ? "HasInOperable"
          : "All",
    minimumPaymentTotal:
      filters.minPriceCents === undefined ? null : filters.minPriceCents / 100,
    readyToShipWithinDays: centralReadyToShipDays(filters.readyToShipWithinDays),
    minimumPricePerMile:
      filters.minRatePerMileCents === undefined
        ? null
        : filters.minRatePerMileCents / 100,
    offset: 0,
    limit: 250,
    sortFields: centralSortFields(filters),
    shipperIds: [],
    desiredDeliveryDate: filters.centralDispatch?.desiredDeliveryDate ?? null,
    displayBlockedShippers: filters.centralDispatch?.shipperStatus === "all",
    showPreferredShippersOnly: filters.centralDispatch?.shipperStatus === "preferred",
    showTaggedOnTop: filters.centralDispatch?.showTaggedOnTop ?? true,
    marketplaceIds: [],
    averageRating:
      filters.centralDispatch?.minimumRating &&
      filters.centralDispatch.minimumRating !== "all"
        ? `R${filters.centralDispatch.minimumRating}`
        : "All",
    shipperOrderIds: filters.centralDispatch?.shipperOrderIds ?? [],
    vehicleYearMakeModel: filters.centralDispatch?.vehicleYearMakeModel ?? "",
    requestType: "Open",
    locations: [
      ...centralLocations(filters.origin, "Pickup"),
      ...centralLocations(filters.destination, "Dropoff")
    ]
  };
  return { ...captured, body: Buffer.from(JSON.stringify(body)) };
}

const centralVehicleTypeValues = new Set([
  "ATV",
  "BOAT",
  "CAR",
  "HEAVY_EQUIPMENT",
  "LARGE_YACHT",
  "MOTORCYCLE",
  "PICKUP",
  "RV",
  "SUV",
  "TRAVEL_TRAILER",
  "VAN",
  "OTHER"
]);

function centralVehicleTypes(values?: string[]): string[] {
  if (!values?.length) return [];
  return [
    ...new Set(
      values.flatMap((value) => {
        const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
        const aliased = {
          SEDAN: "CAR",
          COUPE: "CAR",
          TRUCK: "PICKUP",
          PICKUP_TRUCK: "PICKUP",
          HEAVY: "HEAVY_EQUIPMENT",
          TRAVELTRAILER: "TRAVEL_TRAILER"
        }[normalized] ?? normalized;
        return centralVehicleTypeValues.has(aliased) ? [aliased] : [];
      })
    )
  ];
}

function centralPostedWithinHours(hours?: number): number | null {
  if (hours === undefined) return null;
  return [1, 2, 10, 20, 24].find((supported) => supported >= hours) ?? null;
}

function centralReadyToShipDays(days?: number): number | null {
  if (days === undefined) return null;
  return [0, 1, 2, 3, 4, 5, 6, 7, 10, 14, 30, 60].find(
    (supported) => supported >= days
  ) ?? null;
}

function centralSortFields(filters: SearchFilters): Array<{
  name: "POSTDATE" | "PRICE";
  direction: "ASC" | "DESC";
}> {
  if (filters.sort?.field === "price") {
    const direction = filters.sort.direction === "asc" ? "ASC" : "DESC";
    return [
      { name: "PRICE", direction },
      { name: "POSTDATE", direction: "DESC" }
    ];
  }
  return [
    { name: "POSTDATE", direction: "DESC" },
    { name: "PRICE", direction: "DESC" }
  ];
}

function centralLocations(
  filter: LocationFilter | undefined,
  scope: "Pickup" | "Dropoff"
): Record<string, unknown>[] {
  if (!filter) return [];
  const cities: Array<string | undefined> = filter.cities?.length
    ? filter.cities
    : [undefined];
  const states: Array<string | undefined> = filter.states?.length
    ? filter.states
    : [undefined];
  const count = Math.max(cities.length, states.length, filter.postalCodes?.length ?? 0, 1);

  return Array.from({ length: count }, (_, index) => {
    const city = cities[Math.min(index, cities.length - 1)];
    const state = states[Math.min(index, states.length - 1)]?.toUpperCase();
    const postalCode = filter.postalCodes?.[Math.min(index, filter.postalCodes.length - 1)];
    const label = [city, state, postalCode].filter(Boolean).join(", ").toLowerCase();
    return {
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      ...(postalCode ? { zipCode: postalCode } : {}),
      radius: filter.radiusMiles ?? 100,
      scope,
      id: label
    };
  }).filter((location) => Boolean(location.id));
}

function applySuperDispatchFilters(
  captured: CapturedSessionSearch,
  filters: SearchFilters
): CapturedSessionSearch {
  const body = parseJsonBody(captured.body);
  body.pickup_venues = superDispatchVenues(filters.origin);
  body.delivery_venues = superDispatchVenues(filters.destination);
  delete body.pickup_radius;
  delete body.delivery_radius;
  delete body.vehicle_count;
  if (filters.origin?.radiusMiles !== undefined) {
    body.pickup_radius = filters.origin.radiusMiles * 1.609344;
  }
  if (filters.destination?.radiusMiles !== undefined) {
    body.delivery_radius = filters.destination.radiusMiles * 1.609344;
  }
  if (filters.vehicleCountMin !== undefined) {
    body.vehicle_count = filters.vehicleCountMin;
  }
  body.search_along_route = filters.superDispatch?.searchAlongRoute ?? false;
  if (filters.superDispatch?.outOfRouteDistanceMiles !== undefined) {
    body.out_of_route_distance = filters.superDispatch.outOfRouteDistanceMiles * 1.609344;
  } else {
    delete body.out_of_route_distance;
  }

  const url = new URL(captured.url);
  url.searchParams.set("page", "0");
  url.searchParams.set("size", "250");
  url.searchParams.set("is_user_initiated", "true");
  if (filters.sort) {
    const field = {
      postedAt: "posted_to_loadboard_at",
      price: "price",
      distanceMiles: "distance_meters"
    }[filters.sort.field];
    url.searchParams.set("sort", `${field},${filters.sort.direction}`);
  }
  return { ...captured, url: url.toString(), body: Buffer.from(JSON.stringify(body)) };
}

function superDispatchVenues(filter?: LocationFilter): Record<string, string>[] {
  if (!filter) return [];
  const cities: Array<string | undefined> = filter.cities?.length
    ? filter.cities
    : [undefined];
  const states: Array<string | undefined> = filter.states?.length
    ? filter.states
    : [undefined];
  const postalCodes: Array<string | undefined> = filter.postalCodes?.length
    ? filter.postalCodes
    : [undefined];
  const count = Math.max(cities.length, states.length, postalCodes.length, 1);

  return Array.from({ length: count }, (_, index) => {
    const city = cities[Math.min(index, cities.length - 1)];
    const state = states[Math.min(index, states.length - 1)]?.toLowerCase();
    const zip = postalCodes[Math.min(index, postalCodes.length - 1)];
    return {
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
      ...(zip ? { zip } : {})
    };
  }).filter((venue) => Boolean(venue.city || venue.state || venue.zip));
}

function applyShipCarsFilters(
  captured: CapturedSessionSearch,
  filters: SearchFilters
): CapturedSessionSearch {
  const url = new URL(captured.url);
  const pickupRange = reusableShipCarsRange(url, "pickup", filters.origin);
  const deliveryRange = reusableShipCarsRange(url, "delivery", filters.destination);
  for (const name of [
    "pickup_city",
    "pickup_range",
    "pickup_state",
    "delivery_city",
    "delivery_range",
    "delivery_state",
    "total_carrier_pay",
    "price_per_mile",
    "number_vehicles",
    "max_number_vehicles",
    "operable",
    "enclosed_trailer",
    "ship_within",
    "limit",
    "offset",
    "ordering"
  ]) {
    url.searchParams.delete(name);
  }

  appendShipCarsLocation(url, "pickup", filters.origin, pickupRange);
  appendShipCarsLocation(url, "delivery", filters.destination, deliveryRange);
  if (filters.minPriceCents !== undefined) {
    url.searchParams.set("total_carrier_pay", String(filters.minPriceCents / 100));
  }
  if (filters.minRatePerMileCents !== undefined) {
    url.searchParams.set("price_per_mile", String(filters.minRatePerMileCents / 100));
  }
  if (filters.vehicleCountMin !== undefined) {
    url.searchParams.set("number_vehicles", String(filters.vehicleCountMin));
  }
  if (filters.vehicleCountMax !== undefined) {
    url.searchParams.set("max_number_vehicles", String(filters.vehicleCountMax));
  }
  if (filters.operability && filters.operability !== "all") {
    url.searchParams.set("operable", String(filters.operability === "operable"));
  }
  if (filters.trailerType === "open" || filters.trailerType === "enclosed") {
    url.searchParams.set("enclosed_trailer", String(filters.trailerType === "enclosed"));
  }
  if (filters.readyToShipWithinDays !== undefined) {
    url.searchParams.set("ship_within", String(filters.readyToShipWithinDays));
  }
  url.searchParams.set("limit", "250");
  url.searchParams.set("offset", "0");
  if (filters.sort?.field === "price") {
    url.searchParams.set(
      "ordering",
      `${filters.sort.direction === "desc" ? "-" : ""}total_payment_to_carrier`
    );
  } else if (filters.sort?.field === "distanceMiles") {
    url.searchParams.set(
      "ordering",
      `${filters.sort.direction === "desc" ? "-" : ""}distance_imperial`
    );
  } else {
    url.searchParams.set("ordering", "-create_time");
  }
  return { ...captured, url: url.toString(), body: undefined };
}

function appendShipCarsLocation(
  url: URL,
  prefix: "pickup" | "delivery",
  filter?: LocationFilter,
  reusableRange?: string
): void {
  if (!filter) return;
  const cities = filter.cities ?? [];
  const states = filter.states ?? [];
  for (let index = 0; index < cities.length; index += 1) {
    const state = states[Math.min(index, states.length - 1)];
    url.searchParams.append(`${prefix}_city`, [cities[index], state].filter(Boolean).join(", "));
  }
  for (const state of states) url.searchParams.append(`${prefix}_state`, state.toUpperCase());
  if (filter.radiusMiles !== undefined && reusableRange) {
    const separator = reusableRange.lastIndexOf("|");
    const base = separator >= 0 ? reusableRange.slice(0, separator) : reusableRange;
    url.searchParams.set(`${prefix}_range`, `${base}|${filter.radiusMiles}`);
  }
}

function reusableShipCarsRange(
  url: URL,
  prefix: "pickup" | "delivery",
  filter?: LocationFilter
): string | undefined {
  if (!filter?.radiusMiles || !filter.cities?.length) return undefined;
  const requested = filter.cities.map((city, index) =>
    [city, filter.states?.[Math.min(index, (filter.states?.length ?? 1) - 1)]]
      .filter(Boolean)
      .join(", ")
      .toLowerCase()
  );
  const capturedCities = url.searchParams
    .getAll(`${prefix}_city`)
    .map((city) => city.toLowerCase());
  if (!capturedCities.some((city) => requested.includes(city))) return undefined;
  return url.searchParams.get(`${prefix}_range`) ?? undefined;
}

function parseJsonBody(body?: Buffer): Record<string, unknown> {
  if (!body?.length) return {};
  try {
    const parsed: unknown = JSON.parse(body.toString("utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function requestJsonWithSession(
  providerSession: Session,
  captured: CapturedSessionSearch
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: captured.method,
      url: captured.url,
      session: providerSession,
      redirect: "follow"
    });
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      request.abort();
      finish(() => reject(new Error("Session request timed out")));
    }, 20_000);

    for (const [name, value] of Object.entries(captured.headers)) {
      request.setHeader(name, value);
    }

    request.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on("error", (error) => finish(() => reject(error)));
      response.on("end", () => {
        const statusCode = response.statusCode;
        if (statusCode < 200 || statusCode >= 300) {
          finish(() => reject(new Error(`Session request returned HTTP ${statusCode}`)));
          return;
        }

        const contentTypeHeader = response.headers["content-type"];
        const contentType = Array.isArray(contentTypeHeader)
          ? contentTypeHeader.join(";")
          : (contentTypeHeader ?? "");
        if (!contentType.toLowerCase().includes("json")) {
          finish(() => reject(new Error("Session request did not return JSON")));
          return;
        }

        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
          finish(() => resolve(payload));
        } catch (error) {
          finish(() => reject(error));
        }
      });
    });
    request.on("error", (error) => finish(() => reject(error)));

    if (captured.method === "POST" && captured.body) request.write(captured.body);
    request.end();
  });
}

function matchesSessionSearch(
  configuration: LoadBoardBrowserConfiguration,
  rawUrl: string,
  method: string
): boolean {
  try {
    const url = new URL(rawUrl);
    const search = configuration.sessionSearchEndpoint;
    return method.toUpperCase() === search.method && url.origin === search.origin && url.pathname === search.path;
  } catch {
    return false;
  }
}

function filterReplayHeaders(headers: Record<string, string>): Record<string, string> {
  const standardNames = new Set([
    "accept",
    "authorization",
    "content-type",
    "origin",
    "referer",
    "user-agent"
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const normalized = name.toLowerCase();
      return (
        standardNames.has(normalized) ||
        normalized.startsWith("x-") ||
        /(account|auth|client|session|token)/.test(normalized)
      );
    })
  );
}

function combineUploadData(uploadData?: Electron.UploadData[]): Buffer | undefined {
  if (!uploadData?.length) return undefined;
  const buffers = uploadData.map((part) => part.bytes).filter((bytes) => bytes.length > 0);
  return buffers.length ? Buffer.concat(buffers) : undefined;
}

function describeJsonShape(value: unknown, depth = 0): unknown {
  if (depth >= 8) return "unknown";
  if (Array.isArray(value)) {
    return value.length ? [describeJsonShape(value[0], depth + 1)] : [];
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, describeJsonShape(child, depth + 1)])
    );
  }
  return value === null ? "null" : typeof value;
}

function sanitizeEndpointObservation(
  configuration: LoadBoardBrowserConfiguration,
  details: Electron.OnCompletedListenerDetails
) {
  try {
    const url = new URL(details.url);
    const isProviderHost = configuration.endpointHostSuffixes.some(
      (suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`)
    );
    if (!isProviderHost) return undefined;

    return {
      boardId: configuration.id,
      method: details.method.toUpperCase(),
      origin: url.origin,
      pathTemplate: sanitizePath(url.pathname),
      queryParameterNames: [...new Set(url.searchParams.keys())].sort(),
      statusCode: details.statusCode,
      observedAt: new Date().toISOString()
    };
  } catch {
    return undefined;
  }
}

function sanitizePath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
      if (/^[0-9a-f]{24,}$/i.test(segment)) return ":id";
      return segment;
    })
    .join("/");
}

function isSafeRemoteUrl(url: string): boolean {
  if (url === "about:blank") return true;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}


function safeHost(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
