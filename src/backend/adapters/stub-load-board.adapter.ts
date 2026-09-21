import type {
  AdapterSearchResult,
  LoadBoardAdapter,
  SessionSearchEndpoint
} from "./load-board-adapter";
import type {
  LoadBoardConnectionStatus,
  LoadBoardDataCapability,
  LoadBoardId,
  LoadBoardIntegrationStatus
} from "@shared/types/load-board";
import type { SearchFilters } from "@shared/types/search-filters";

/** Temporary base class until a provider receives an approved integration path. */
export abstract class StubLoadBoardAdapter implements LoadBoardAdapter {
  abstract readonly id: LoadBoardId;
  abstract readonly displayName: string;
  abstract readonly portalUrl: string;
  abstract readonly sessionPartition: string;
  abstract readonly sessionCookieNamePatterns: string[];
  abstract readonly endpointHostSuffixes: string[];
  abstract readonly sessionSearchEndpoint: SessionSearchEndpoint;
  abstract readonly apiDocumentationUrl: string;
  abstract readonly apiCapabilities: readonly LoadBoardDataCapability[];
  abstract readonly marketplaceSearchDocumented: boolean;
  abstract readonly apiAccessMessage: string;
  readonly loginUrlFragments = ["login", "signin", "sign-in", "auth", "sso"];

  async getConnectionStatus(): Promise<LoadBoardConnectionStatus> {
    return {
      state: "not-configured",
      checkedAt: new Date().toISOString(),
      message: "Open the isolated browser to connect this source."
    };
  }

  async getIntegrationStatus(): Promise<LoadBoardIntegrationStatus> {
    return {
      state: "limited",
      channel: "session-endpoint",
      capabilities: ["marketplace-search"],
      marketplaceSearchDocumented: false,
      documentationUrl: this.portalUrl,
      checkedAt: new Date().toISOString(),
      message: `Session endpoint discovery is enabled for ${this.displayName}. Perform a normal load search to map its requests.`
    };
  }

  async searchLoads(_filters: SearchFilters): Promise<AdapterSearchResult> {
    return {
      candidates: [],
      fetchedAt: new Date().toISOString(),
      warnings: [`${this.displayName}: session response mapping is not ready yet.`]
    };
  }
}
