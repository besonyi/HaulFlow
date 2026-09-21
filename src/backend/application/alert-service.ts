import { randomUUID } from "node:crypto";
import type { AlertEvent } from "@shared/types/alert-event";
import type { AlertRule } from "@shared/types/alert-rule";
import type { Load } from "@shared/types/load";
import type { LoadBoardSummary } from "@shared/types/load-board";
import type { SqliteDatabase } from "../database/sqlite-database";

/** Evaluates load alerts after a refresh without exposing any provider session data. */
export class AlertService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly notify: (event: AlertEvent) => void = () => undefined
  ) {}

  async evaluateLoads(loads: Load[]): Promise<AlertEvent[]> {
    const rules = (await this.database.listAlertRules()).filter((rule) => rule.enabled && isLoadRule(rule));
    const events: AlertEvent[] = [];

    for (const rule of rules) {
      const matches = loads.filter((load) => matchesRule(load, rule));
      const hasBaseline = await this.database.hasAlertRuleBaseline(rule.id);
      if (!hasBaseline) {
        await this.database.rememberAlertLoads(rule.id, matches.map((load) => load.id));
        await this.database.markAlertRuleBaseline(rule.id);
        continue;
      }

      for (const load of matches) {
        if (!(await this.database.rememberAlertLoad(rule.id, load.id))) continue;
        const event = createEvent(rule, load);
        if (await this.database.recordAlertEvent(event)) events.push(event);
      }
    }
    for (const event of events) this.notify(event);
    return events;
  }

  async evaluateBoardHealth(boards: LoadBoardSummary[]): Promise<AlertEvent[]> {
    const rules = (await this.database.listAlertRules()).filter((rule) => rule.enabled && isHealthRule(rule));
    const events: AlertEvent[] = [];

    for (const rule of rules) {
      const matchingBoards = boards.filter((board) => matchesHealthRule(board, rule));
      const hasBaseline = await this.database.hasAlertRuleBaseline(rule.id);
      if (!hasBaseline) {
        await this.database.rememberAlertLoads(rule.id, matchingBoards.map((board) => healthKey(board)));
        await this.database.markAlertRuleBaseline(rule.id);
        continue;
      }
      for (const board of matchingBoards) {
        if (!(await this.database.rememberAlertLoad(rule.id, healthKey(board)))) continue;
        const event = createHealthEvent(rule, board);
        if (await this.database.recordAlertEvent(event)) events.push(event);
      }
    }
    for (const event of events) this.notify(event);
    return events;
  }
}

function isLoadRule(rule: AlertRule): boolean {
  return rule.kind === "new-load" || rule.kind === "minimum-price" || rule.kind === "minimum-rate";
}

function isHealthRule(rule: AlertRule): boolean {
  return rule.kind === "session-expired" || rule.kind === "adapter-failure";
}

function matchesRule(load: Load, rule: AlertRule): boolean {
  if (rule.sources?.length && !rule.sources.includes(load.source)) return false;
  if (rule.kind === "new-load") return true;
  if (rule.kind === "minimum-price") return (load.price?.amountCents ?? 0) >= (rule.minimumPriceCents ?? Number.POSITIVE_INFINITY);
  if (rule.kind === "minimum-rate") return (load.ratePerMileCents ?? 0) >= (rule.minimumRatePerMileCents ?? Number.POSITIVE_INFINITY);
  return false;
}

function createEvent(rule: AlertRule, load: Load): AlertEvent {
  const route = [formatLocation(load.pickup.location), formatLocation(load.delivery.location)].join(" → ");
  const pay = load.price ? `$${(load.price.amountCents / 100).toLocaleString("en-US")}` : "Pay pending";
  return {
    id: randomUUID(), ruleId: rule.id, ruleName: rule.name, loadId: load.id, source: load.source,
    title: rule.kind === "new-load" ? "New matching load" : rule.name,
    message: `${route} · ${pay}`,
    occurredAt: new Date().toISOString()
  };
}

function matchesHealthRule(board: LoadBoardSummary, rule: AlertRule): boolean {
  if (rule.sources?.length && !rule.sources.includes(board.id)) return false;
  return rule.kind === "session-expired"
    ? board.connection.state === "expired"
    : board.connection.state === "error";
}

function healthKey(board: LoadBoardSummary): string {
  return `health:${board.id}:${board.connection.state}`;
}

function createHealthEvent(rule: AlertRule, board: LoadBoardSummary): AlertEvent {
  const needsSignIn = rule.kind === "session-expired";
  return {
    id: randomUUID(), ruleId: rule.id, ruleName: rule.name, loadId: healthKey(board), source: board.id,
    title: needsSignIn ? `${board.displayName} needs sign-in` : `${board.displayName} refresh issue`,
    message: board.connection.message ?? (needsSignIn ? "The saved session has expired." : "The source needs attention."),
    occurredAt: new Date().toISOString()
  };
}

function formatLocation(location: Load["pickup"]["location"]): string {
  return [location.city, location.state, location.postalCode].filter(Boolean).join(", ") || "Location pending";
}
