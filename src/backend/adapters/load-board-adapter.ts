import type { Load, Money, Stop, Vehicle } from "@shared/types/load";
import type {
  LoadBoardConnectionStatus,
  LoadBoardIntegrationStatus,
  LoadBoardId
} from "@shared/types/load-board";
import type { SearchFilters } from "@shared/types/search-filters";

/**
 * Source-shaped data kept inside the backend until it is normalized.
 * Provider-specific raw payloads must not cross this boundary into the UI.
 */
export interface AdapterLoadCandidate {
  externalId: string;
  source: LoadBoardId;
  pickup: Stop;
  delivery: Stop;
  vehicles: Vehicle[];
  trailerType?: Load["trailerType"];
  price?: Money;
  distanceMiles?: number;
  postedAt?: string;
  sourceUrl?: string;
  rawUpdatedAt?: string;
  status?: Load["status"];
  details?: Load["details"];
}

export interface AdapterSearchResult {
  candidates: AdapterLoadCandidate[];
  fetchedAt: string;
  warnings?: string[];
}

export interface LoadBoardBrowserConfiguration {
  id: LoadBoardId;
  displayName: string;
  startUrl: string;
  partition: string;
  loginUrlFragments: string[];
  sessionCookieNamePatterns: string[];
  endpointHostSuffixes: string[];
  sessionSearchEndpoint: SessionSearchEndpoint;
}

export interface SessionSearchEndpoint {
  method: "GET" | "POST";
  origin: string;
  path: string;
}

/**
 * Provider integration contract. Concrete adapters stay Electron- and React-free
 * so Phase 2 can inject isolated browser sessions without leaking credentials.
 */
export interface LoadBoardAdapter {
  readonly id: LoadBoardId;
  readonly displayName: string;
  readonly portalUrl: string;
  readonly sessionPartition: string;
  readonly loginUrlFragments: string[];
  readonly sessionCookieNamePatterns: string[];
  readonly endpointHostSuffixes: string[];
  readonly sessionSearchEndpoint: SessionSearchEndpoint;

  getConnectionStatus(): Promise<LoadBoardConnectionStatus>;
  getIntegrationStatus(): Promise<LoadBoardIntegrationStatus>;
  searchLoads(filters: SearchFilters): Promise<AdapterSearchResult>;
}
