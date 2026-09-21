import type { LoadBoardId } from "@shared/types/load-board";
import type { SearchFilters } from "@shared/types/search-filters";

export interface SessionSearchResponse {
  payload: unknown;
  fetchedAt: string;
}

export interface SessionSearchClient {
  search(boardId: LoadBoardId, filters: SearchFilters): Promise<SessionSearchResponse>;
}

type SessionSearchHandler = (
  boardId: LoadBoardId,
  filters: SearchFilters
) => Promise<SessionSearchResponse>;

/**
 * Breaks the construction cycle between provider adapters and Electron's
 * session manager. The main process connects the handler after both exist.
 */
export class SessionSearchGateway implements SessionSearchClient {
  private handler?: SessionSearchHandler;

  connect(handler: SessionSearchHandler): void {
    this.handler = handler;
  }

  async search(boardId: LoadBoardId, filters: SearchFilters): Promise<SessionSearchResponse> {
    if (!this.handler) throw new Error("Session search is not ready yet.");
    return this.handler(boardId, filters);
  }
}
