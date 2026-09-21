import { z } from "zod";

export const loadBoardIds = [
  "central-dispatch",
  "super-dispatch",
  "ship-cars"
] as const;

export const loadBoardIdSchema = z.enum(loadBoardIds);

export type LoadBoardId = z.infer<typeof loadBoardIdSchema>;

export const loadBoardConnectionStates = [
  "not-configured",
  "disconnected",
  "connected",
  "expired",
  "error"
] as const;

export const loadBoardConnectionStateSchema = z.enum(loadBoardConnectionStates);

export type LoadBoardConnectionState = z.infer<typeof loadBoardConnectionStateSchema>;

export interface LoadBoardConnectionStatus {
  state: LoadBoardConnectionState;
  checkedAt: string;
  message?: string;
}

export interface LoadBoardBrowserState {
  boardId: LoadBoardId;
  isOpen: boolean;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  hasStoredSession: boolean;
  currentHost?: string;
  lastOpenedAt?: string;
  error?: string;
}

export interface LoadBoardStateEvent {
  browser: LoadBoardBrowserState;
  connection: LoadBoardConnectionStatus;
}

export type LoadBoardIntegrationState =
  | "credentials-required"
  | "ready"
  | "limited"
  | "error";

export type LoadBoardDataCapability =
  | "marketplace-search"
  | "own-listings"
  | "assigned-loads"
  | "webhooks";

export interface LoadBoardIntegrationStatus {
  state: LoadBoardIntegrationState;
  channel: "official-api" | "session-endpoint";
  capabilities: LoadBoardDataCapability[];
  marketplaceSearchDocumented: boolean;
  documentationUrl: string;
  checkedAt: string;
  message: string;
}

export interface ObservedLoadBoardEndpoint {
  boardId: LoadBoardId;
  method: string;
  origin: string;
  pathTemplate: string;
  queryParameterNames: string[];
  statusCode: number;
  firstSeenAt: string;
  lastSeenAt: string;
  observationCount: number;
}

export interface LoadBoardSummary {
  id: LoadBoardId;
  displayName: string;
  portalUrl: string;
  connection: LoadBoardConnectionStatus;
  integration: LoadBoardIntegrationStatus;
  observedEndpointCount?: number;
  browser?: LoadBoardBrowserState;
}
