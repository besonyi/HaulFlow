import type {
  LoadBoardConnectionState,
  LoadBoardId
} from "@shared/types/load-board";

/**
 * Non-sensitive session metadata. Provider cookies and credentials never pass
 * through this store; Electron keeps them in each provider's persistent
 * browser partition.
 */
export interface LoadBoardSessionMetadata {
  boardId: LoadBoardId;
  connectionState: LoadBoardConnectionState;
  hasStoredSession: boolean;
  currentHost?: string;
  lastOpenedAt?: string;
  checkedAt: string;
  updatedAt: string;
}

export interface LoadBoardSessionMetadataStore {
  getLoadBoardSession(boardId: LoadBoardId): Promise<LoadBoardSessionMetadata | undefined>;
  saveLoadBoardSession(metadata: LoadBoardSessionMetadata): Promise<void>;
}
