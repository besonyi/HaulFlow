import type { LoadBoardId } from "./load-board";

export interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  loadId: string;
  source: LoadBoardId;
  title: string;
  message: string;
  occurredAt: string;
}
