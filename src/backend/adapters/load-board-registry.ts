import type { Load } from "@shared/types/load";
import type { LoadBoardSummary } from "@shared/types/load-board";
import type { SearchFilters } from "@shared/types/search-filters";
import type {
  LoadBoardAdapter,
  LoadBoardBrowserConfiguration
} from "./load-board-adapter";
import { normalizeAdapterLoad } from "../normalization/normalize-adapter-load";

export class LoadBoardRegistry {
  constructor(private readonly adapters: LoadBoardAdapter[]) {}

  getBrowserConfigurations(): LoadBoardBrowserConfiguration[] {
    return this.adapters.map((adapter) => ({
      id: adapter.id,
      displayName: adapter.displayName,
      startUrl: adapter.portalUrl,
      partition: adapter.sessionPartition,
      loginUrlFragments: adapter.loginUrlFragments,
      sessionCookieNamePatterns: adapter.sessionCookieNamePatterns,
      endpointHostSuffixes: adapter.endpointHostSuffixes,
      sessionSearchEndpoint: adapter.sessionSearchEndpoint
    }));
  }

  async list(): Promise<LoadBoardSummary[]> {
    return Promise.all(
      this.adapters.map(async (adapter) => ({
        id: adapter.id,
        displayName: adapter.displayName,
        portalUrl: adapter.portalUrl,
        connection: await adapter.getConnectionStatus(),
        integration: await adapter.getIntegrationStatus()
      }))
    );
  }

  /**
   * Reserved for a future refresh command. It is safe today: stubs return no
   * provider data and explain why through warnings.
   */
  async fetchNormalizedLoads(filters: SearchFilters): Promise<{
    loads: Load[];
    warnings: string[];
    unavailableSources: LoadBoardAdapter["id"][];
  }> {
    const selectedAdapters = filters.sources?.length
      ? this.adapters.filter((adapter) => filters.sources?.includes(adapter.id))
      : this.adapters;

    const results = await Promise.all(
      selectedAdapters.map(async (adapter) => {
        try {
          return { boardId: adapter.id, result: await adapter.searchLoads(filters) };
        } catch (error) {
          return {
            boardId: adapter.id,
            result: {
              candidates: [],
              fetchedAt: new Date().toISOString(),
              warnings: [
                `${adapter.displayName}: ${error instanceof Error ? error.message : "source refresh failed"}`
              ]
            }
          };
        }
      })
    );

    return {
      loads: results.flatMap(({ result }) => result.candidates.map(normalizeAdapterLoad)),
      warnings: results.flatMap(({ result }) => result.warnings ?? []),
      unavailableSources: results
        .filter(({ result }) => Boolean(result.warnings?.length))
        .map(({ boardId }) => boardId)
    };
  }
}
