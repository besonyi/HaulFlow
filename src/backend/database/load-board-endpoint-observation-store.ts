import type { LoadBoardId, ObservedLoadBoardEndpoint } from "@shared/types/load-board";

export type { ObservedLoadBoardEndpoint } from "@shared/types/load-board";

export type NewLoadBoardEndpointObservation = Omit<
  ObservedLoadBoardEndpoint,
  "firstSeenAt" | "lastSeenAt" | "observationCount"
> & {
  observedAt: string;
};

export interface LoadBoardEndpointObservationStore {
  listObservedEndpoints(boardId: LoadBoardId): Promise<ObservedLoadBoardEndpoint[]>;
  recordObservedEndpoint(observation: NewLoadBoardEndpointObservation): Promise<void>;
  saveEndpointResponseShape(input: {
    boardId: LoadBoardId;
    method: string;
    origin: string;
    pathTemplate: string;
    responseShape: unknown;
    capturedAt: string;
  }): Promise<void>;
}
