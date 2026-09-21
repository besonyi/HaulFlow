import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import type { DatabaseStatus } from "@shared/contracts/ipc";
import type { LoadBoardId } from "@shared/types/load-board";
import { searchFiltersSchema } from "@shared/types/search-filters";
import type { SavedSearch, SavedSearchInput } from "@shared/types/saved-search";
import { savedLoadInputSchema, type SavedLoad, type SavedLoadInput } from "@shared/types/saved-load";
import { alertRuleInputSchema, type AlertRule, type AlertRuleInput } from "@shared/types/alert-rule";
import type { AlertEvent } from "@shared/types/alert-event";
import type { Load } from "@shared/types/load";
import { alertRefreshSettingsSchema, defaultAlertRefreshSettings, type AlertRefreshSettings } from "@shared/types/alert-refresh-settings";
import type {
  LoadBoardEndpointObservationStore,
  NewLoadBoardEndpointObservation,
  ObservedLoadBoardEndpoint
} from "./load-board-endpoint-observation-store";
import type {
  LoadBoardSessionMetadata,
  LoadBoardSessionMetadataStore
} from "./load-board-session-metadata-store";

const schema = `
  CREATE TABLE IF NOT EXISTS load_board_sessions (
    board_id TEXT PRIMARY KEY NOT NULL,
    connection_state TEXT NOT NULL,
    has_stored_session INTEGER NOT NULL DEFAULT 0,
    current_host TEXT,
    last_opened_at TEXT,
    checked_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS load_board_endpoints (
    board_id TEXT NOT NULL,
    method TEXT NOT NULL,
    origin TEXT NOT NULL,
    path_template TEXT NOT NULL,
    query_parameter_names TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    observation_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (board_id, method, origin, path_template, query_parameter_names)
  );

  CREATE INDEX IF NOT EXISTS idx_load_board_endpoints_board_last_seen
    ON load_board_endpoints (board_id, last_seen_at DESC);

  CREATE TABLE IF NOT EXISTS load_board_endpoint_schemas (
    board_id TEXT NOT NULL,
    method TEXT NOT NULL,
    origin TEXT NOT NULL,
    path_template TEXT NOT NULL,
    response_shape TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    PRIMARY KEY (board_id, method, origin, path_template)
  );

  CREATE TABLE IF NOT EXISTS saved_searches (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    filters TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_saved_searches_updated_at
    ON saved_searches (updated_at DESC);

  CREATE TABLE IF NOT EXISTS saved_loads (
    load_id TEXT PRIMARY KEY NOT NULL,
    source TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_saved_loads_updated_at
    ON saved_loads (updated_at DESC);

  CREATE TABLE IF NOT EXISTS alert_rules (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    sources TEXT NOT NULL,
    minimum_price_cents INTEGER,
    minimum_rate_per_mile_cents INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_alert_rules_updated_at
    ON alert_rules (updated_at DESC);

  CREATE TABLE IF NOT EXISTS alert_rule_baselines (
    rule_id TEXT PRIMARY KEY NOT NULL,
    established_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alert_seen_loads (
    rule_id TEXT NOT NULL,
    load_id TEXT NOT NULL,
    PRIMARY KEY (rule_id, load_id)
  );

  CREATE TABLE IF NOT EXISTS alert_events (
    id TEXT PRIMARY KEY NOT NULL,
    rule_id TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    load_id TEXT NOT NULL,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    UNIQUE(rule_id, load_id)
  );

  CREATE INDEX IF NOT EXISTS idx_alert_events_occurred_at
    ON alert_events (occurred_at DESC);

  CREATE TABLE IF NOT EXISTS alert_refresh_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    interval_minutes INTEGER NOT NULL DEFAULT 15,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS normalized_load_cache (
    id TEXT PRIMARY KEY NOT NULL,
    source TEXT NOT NULL,
    payload TEXT NOT NULL,
    cached_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_normalized_load_cache_cached_at
    ON normalized_load_cache (cached_at DESC);

  PRAGMA user_version = 6;
`;

export class SqliteDatabase
  implements LoadBoardSessionMetadataStore, LoadBoardEndpointObservationStore
{
  private database?: Database;
  private initialized = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly databasePath: string,
    private readonly wasmPath: string
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await mkdir(dirname(this.databasePath), { recursive: true });
    const wasmFile = await readFile(this.wasmPath);
    const wasmBinary = Uint8Array.from(wasmFile).buffer;
    const SQL = await initSqlJs({ wasmBinary });
    const existingData = await this.readExistingDatabase();

    this.database = existingData ? new SQL.Database(existingData) : new SQL.Database();
    this.database.run(schema);
    this.initialized = true;
    await this.persist();
  }

  getStatus(): DatabaseStatus {
    return {
      engine: "sqlite",
      mode: this.initialized ? "ready" : "unavailable",
      path: this.databasePath,
      message: this.initialized
        ? "Local SQLite metadata storage is ready. Provider credentials are not stored here."
        : "Local SQLite metadata storage has not been initialized."
    };
  }

  async getLoadBoardSession(
    boardId: LoadBoardId
  ): Promise<LoadBoardSessionMetadata | undefined> {
    const database = this.getDatabase();
    const statement = database.prepare(`
      SELECT
        board_id,
        connection_state,
        has_stored_session,
        current_host,
        last_opened_at,
        checked_at,
        updated_at
      FROM load_board_sessions
      WHERE board_id = ?
    `);

    try {
      statement.bind([boardId]);
      if (!statement.step()) return undefined;
      const row = statement.getAsObject();
      return {
        boardId: row.board_id as LoadBoardSessionMetadata["boardId"],
        connectionState: row.connection_state as LoadBoardSessionMetadata["connectionState"],
        hasStoredSession: row.has_stored_session === 1,
        currentHost: optionalString(row.current_host),
        lastOpenedAt: optionalString(row.last_opened_at),
        checkedAt: String(row.checked_at),
        updatedAt: String(row.updated_at)
      };
    } finally {
      statement.free();
    }
  }

  async saveLoadBoardSession(metadata: LoadBoardSessionMetadata): Promise<void> {
    const database = this.getDatabase();
    const statement = database.prepare(`
      INSERT INTO load_board_sessions (
        board_id,
        connection_state,
        has_stored_session,
        current_host,
        last_opened_at,
        checked_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(board_id) DO UPDATE SET
        connection_state = excluded.connection_state,
        has_stored_session = excluded.has_stored_session,
        current_host = excluded.current_host,
        last_opened_at = excluded.last_opened_at,
        checked_at = excluded.checked_at,
        updated_at = excluded.updated_at
    `);

    try {
      statement.run([
        metadata.boardId,
        metadata.connectionState,
        metadata.hasStoredSession ? 1 : 0,
        metadata.currentHost ?? null,
        metadata.lastOpenedAt ?? null,
        metadata.checkedAt,
        metadata.updatedAt
      ]);
    } finally {
      statement.free();
    }

    await this.persist();
  }

  async listObservedEndpoints(boardId: LoadBoardId): Promise<ObservedLoadBoardEndpoint[]> {
    const database = this.getDatabase();
    const statement = database.prepare(`
      SELECT
        board_id,
        method,
        origin,
        path_template,
        query_parameter_names,
        status_code,
        first_seen_at,
        last_seen_at,
        observation_count
      FROM load_board_endpoints
      WHERE board_id = ?
      ORDER BY last_seen_at DESC
    `);
    const endpoints: ObservedLoadBoardEndpoint[] = [];

    try {
      statement.bind([boardId]);
      while (statement.step()) {
        const row = statement.getAsObject();
        endpoints.push({
          boardId: row.board_id as LoadBoardId,
          method: String(row.method),
          origin: String(row.origin),
          pathTemplate: String(row.path_template),
          queryParameterNames: parseStringArray(row.query_parameter_names),
          statusCode: Number(row.status_code),
          firstSeenAt: String(row.first_seen_at),
          lastSeenAt: String(row.last_seen_at),
          observationCount: Number(row.observation_count)
        });
      }
      return endpoints;
    } finally {
      statement.free();
    }
  }

  async recordObservedEndpoint(observation: NewLoadBoardEndpointObservation): Promise<void> {
    const database = this.getDatabase();
    const statement = database.prepare(`
      INSERT INTO load_board_endpoints (
        board_id,
        method,
        origin,
        path_template,
        query_parameter_names,
        status_code,
        first_seen_at,
        last_seen_at,
        observation_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(board_id, method, origin, path_template, query_parameter_names) DO UPDATE SET
        status_code = excluded.status_code,
        last_seen_at = excluded.last_seen_at,
        observation_count = load_board_endpoints.observation_count + 1
    `);

    try {
      statement.run([
        observation.boardId,
        observation.method,
        observation.origin,
        observation.pathTemplate,
        JSON.stringify(observation.queryParameterNames),
        observation.statusCode,
        observation.observedAt,
        observation.observedAt
      ]);
    } finally {
      statement.free();
    }

    await this.persist();
  }

  async saveEndpointResponseShape(input: {
    boardId: LoadBoardId;
    method: string;
    origin: string;
    pathTemplate: string;
    responseShape: unknown;
    capturedAt: string;
  }): Promise<void> {
    const database = this.getDatabase();
    const statement = database.prepare(`
      INSERT INTO load_board_endpoint_schemas (
        board_id,
        method,
        origin,
        path_template,
        response_shape,
        captured_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(board_id, method, origin, path_template) DO UPDATE SET
        response_shape = excluded.response_shape,
        captured_at = excluded.captured_at
    `);

    try {
      statement.run([
        input.boardId,
        input.method,
        input.origin,
        input.pathTemplate,
        JSON.stringify(input.responseShape),
        input.capturedAt
      ]);
    } finally {
      statement.free();
    }

    await this.persist();
  }

  async listSavedSearches(): Promise<SavedSearch[]> {
    const database = this.getDatabase();
    const statement = database.prepare(`
      SELECT id, name, filters, created_at, updated_at
      FROM saved_searches
      ORDER BY updated_at DESC
    `);
    const searches: SavedSearch[] = [];

    try {
      while (statement.step()) {
        const row = statement.getAsObject();
        const filters = searchFiltersSchema.safeParse(parseJson(row.filters));
        if (!filters.success) continue;
        searches.push({
          id: String(row.id),
          name: String(row.name),
          filters: filters.data,
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at)
        });
      }
      return searches;
    } finally {
      statement.free();
    }
  }

  async saveSearch(input: SavedSearchInput): Promise<SavedSearch> {
    const now = new Date().toISOString();
    const savedSearch: SavedSearch = {
      id: randomUUID(),
      name: input.name.trim(),
      filters: input.filters,
      createdAt: now,
      updatedAt: now
    };
    const statement = this.getDatabase().prepare(`
      INSERT INTO saved_searches (id, name, filters, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    try {
      statement.run([
        savedSearch.id,
        savedSearch.name,
        JSON.stringify(savedSearch.filters),
        savedSearch.createdAt,
        savedSearch.updatedAt
      ]);
    } finally {
      statement.free();
    }
    await this.persist();
    return savedSearch;
  }

  async deleteSavedSearch(id: string): Promise<void> {
    const statement = this.getDatabase().prepare("DELETE FROM saved_searches WHERE id = ?");
    try {
      statement.run([id]);
    } finally {
      statement.free();
    }
    await this.persist();
  }

  async listSavedLoads(): Promise<SavedLoad[]> {
    const statement = this.getDatabase().prepare(`
      SELECT load_id, payload, created_at, updated_at
      FROM saved_loads
      ORDER BY updated_at DESC
    `);
    const savedLoads: SavedLoad[] = [];
    try {
      while (statement.step()) {
        const row = statement.getAsObject();
        const parsed = savedLoadInputSchema.safeParse({ load: parseJson(row.payload) });
        if (!parsed.success) continue;
        savedLoads.push({
          id: String(row.load_id),
          load: parsed.data.load as Load,
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at)
        });
      }
      return savedLoads;
    } finally {
      statement.free();
    }
  }

  async saveLoad(input: SavedLoadInput): Promise<SavedLoad> {
    const value = savedLoadInputSchema.parse(input) as SavedLoadInput;
    const now = new Date().toISOString();
    const existing = this.getDatabase().prepare("SELECT created_at FROM saved_loads WHERE load_id = ?");
    let createdAt = now;
    try {
      existing.bind([value.load.id]);
      if (existing.step()) createdAt = String(existing.getAsObject().created_at);
    } finally {
      existing.free();
    }

    const statement = this.getDatabase().prepare(`
      INSERT INTO saved_loads (load_id, source, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(load_id) DO UPDATE SET
        source = excluded.source,
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `);
    try {
      statement.run([value.load.id, value.load.source, JSON.stringify(value.load), createdAt, now]);
    } finally {
      statement.free();
    }
    await this.persist();
    return { id: value.load.id, load: value.load as Load, createdAt, updatedAt: now };
  }

  async deleteSavedLoad(id: string): Promise<void> {
    const statement = this.getDatabase().prepare("DELETE FROM saved_loads WHERE load_id = ?");
    try {
      statement.run([id]);
    } finally {
      statement.free();
    }
    await this.persist();
  }

  async listAlertRules(): Promise<AlertRule[]> {
    const statement = this.getDatabase().prepare(`
      SELECT id, name, kind, enabled, sources, minimum_price_cents, minimum_rate_per_mile_cents, created_at, updated_at
      FROM alert_rules ORDER BY updated_at DESC
    `);
    const rules: AlertRule[] = [];
    try {
      while (statement.step()) {
        const row = statement.getAsObject();
        const parsed = alertRuleInputSchema.safeParse({
          name: String(row.name), kind: String(row.kind), enabled: row.enabled === 1,
          sources: parseStringArray(row.sources),
          minimumPriceCents: optionalNumber(row.minimum_price_cents),
          minimumRatePerMileCents: optionalNumber(row.minimum_rate_per_mile_cents)
        });
        if (!parsed.success) continue;
        rules.push({ id: String(row.id), ...parsed.data, createdAt: String(row.created_at), updatedAt: String(row.updated_at) });
      }
      return rules;
    } finally { statement.free(); }
  }

  async saveAlertRule(input: AlertRuleInput): Promise<AlertRule> {
    const values = alertRuleInputSchema.parse(input);
    const now = new Date().toISOString();
    const rule: AlertRule = { id: randomUUID(), ...values, createdAt: now, updatedAt: now };
    const statement = this.getDatabase().prepare(`
      INSERT INTO alert_rules (id, name, kind, enabled, sources, minimum_price_cents, minimum_rate_per_mile_cents, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      statement.run([rule.id, rule.name, rule.kind, rule.enabled ? 1 : 0, JSON.stringify(rule.sources ?? []), rule.minimumPriceCents ?? null, rule.minimumRatePerMileCents ?? null, rule.createdAt, rule.updatedAt]);
    } finally { statement.free(); }
    await this.persist();
    return rule;
  }

  async setAlertRuleEnabled(id: string, enabled: boolean): Promise<AlertRule> {
    const statement = this.getDatabase().prepare("UPDATE alert_rules SET enabled = ?, updated_at = ? WHERE id = ?");
    try { statement.run([enabled ? 1 : 0, new Date().toISOString(), id]); } finally { statement.free(); }
    await this.persist();
    const rule = (await this.listAlertRules()).find((entry) => entry.id === id);
    if (!rule) throw new Error("Alert rule was not found.");
    return rule;
  }

  async deleteAlertRule(id: string): Promise<void> {
    const database = this.getDatabase();
    for (const sql of ["DELETE FROM alert_rules WHERE id = ?", "DELETE FROM alert_rule_baselines WHERE rule_id = ?", "DELETE FROM alert_seen_loads WHERE rule_id = ?", "DELETE FROM alert_events WHERE rule_id = ?"]) {
      const statement = database.prepare(sql);
      try { statement.run([id]); } finally { statement.free(); }
    }
    await this.persist();
  }

  async hasAlertRuleBaseline(ruleId: string): Promise<boolean> {
    const statement = this.getDatabase().prepare("SELECT 1 FROM alert_rule_baselines WHERE rule_id = ?");
    try { statement.bind([ruleId]); return statement.step(); } finally { statement.free(); }
  }

  async markAlertRuleBaseline(ruleId: string): Promise<void> {
    const statement = this.getDatabase().prepare("INSERT OR IGNORE INTO alert_rule_baselines (rule_id, established_at) VALUES (?, ?)");
    try { statement.run([ruleId, new Date().toISOString()]); } finally { statement.free(); }
    await this.persist();
  }

  async rememberAlertLoads(ruleId: string, loadIds: string[]): Promise<void> {
    const statement = this.getDatabase().prepare("INSERT OR IGNORE INTO alert_seen_loads (rule_id, load_id) VALUES (?, ?)");
    try { for (const loadId of loadIds) statement.run([ruleId, loadId]); } finally { statement.free(); }
    await this.persist();
  }

  async rememberAlertLoad(ruleId: string, loadId: string): Promise<boolean> {
    const statement = this.getDatabase().prepare("INSERT OR IGNORE INTO alert_seen_loads (rule_id, load_id) VALUES (?, ?)");
    try {
      statement.run([ruleId, loadId]);
      return this.getDatabase().getRowsModified() > 0;
    } finally { statement.free(); }
  }

  async recordAlertEvent(event: AlertEvent): Promise<boolean> {
    const statement = this.getDatabase().prepare(`
      INSERT OR IGNORE INTO alert_events (id, rule_id, rule_name, load_id, source, title, message, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      statement.run([event.id, event.ruleId, event.ruleName, event.loadId, event.source, event.title, event.message, event.occurredAt]);
      return this.getDatabase().getRowsModified() > 0;
    } finally { statement.free(); }
  }

  async listAlertEvents(): Promise<AlertEvent[]> {
    const statement = this.getDatabase().prepare(`
      SELECT id, rule_id, rule_name, load_id, source, title, message, occurred_at
      FROM alert_events ORDER BY occurred_at DESC LIMIT 50
    `);
    const events: AlertEvent[] = [];
    try {
      while (statement.step()) {
        const row = statement.getAsObject();
        events.push({ id: String(row.id), ruleId: String(row.rule_id), ruleName: String(row.rule_name), loadId: String(row.load_id), source: String(row.source) as AlertEvent["source"], title: String(row.title), message: String(row.message), occurredAt: String(row.occurred_at) });
      }
      return events;
    } finally { statement.free(); }
  }

  async getAlertRefreshSettings(): Promise<AlertRefreshSettings> {
    const statement = this.getDatabase().prepare("SELECT enabled, interval_minutes FROM alert_refresh_settings WHERE id = 1");
    try {
      if (!statement.step()) return defaultAlertRefreshSettings;
      const row = statement.getAsObject();
      const parsed = alertRefreshSettingsSchema.safeParse({ enabled: row.enabled === 1, intervalMinutes: Number(row.interval_minutes) });
      return parsed.success ? parsed.data : defaultAlertRefreshSettings;
    } finally { statement.free(); }
  }

  async saveAlertRefreshSettings(input: AlertRefreshSettings): Promise<AlertRefreshSettings> {
    const settings = alertRefreshSettingsSchema.parse(input);
    const statement = this.getDatabase().prepare(`
      INSERT INTO alert_refresh_settings (id, enabled, interval_minutes, updated_at) VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled, interval_minutes = excluded.interval_minutes, updated_at = excluded.updated_at
    `);
    try { statement.run([settings.enabled ? 1 : 0, settings.intervalMinutes, new Date().toISOString()]); } finally { statement.free(); }
    await this.persist();
    return settings;
  }

  /** Stores only normalized load data; browser cookies and raw provider responses never enter SQLite. */
  async cacheNormalizedLoads(loads: Load[]): Promise<void> {
    if (!loads.length) return;
    const cachedAt = new Date().toISOString();
    const statement = this.getDatabase().prepare(`
      INSERT INTO normalized_load_cache (id, source, payload, cached_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET source = excluded.source, payload = excluded.payload, cached_at = excluded.cached_at
    `);
    try {
      for (const load of loads) statement.run([load.id, load.source, JSON.stringify(load), cachedAt]);
    } finally { statement.free(); }
    await this.persist();
  }

  async listCachedNormalizedLoads(maxAgeHours = 24): Promise<Load[]> {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1_000).toISOString();
    const statement = this.getDatabase().prepare(`
      SELECT payload FROM normalized_load_cache WHERE cached_at >= ? ORDER BY cached_at DESC
    `);
    const loads: Load[] = [];
    try {
      statement.bind([cutoff]);
      while (statement.step()) {
        const cached = parseCachedLoad(statement.getAsObject().payload);
        if (cached) loads.push(cached);
      }
      return loads;
    } finally { statement.free(); }
  }

  async close(): Promise<void> {
    if (!this.database) return;

    await this.persist();
    await this.writeQueue;
    this.database.close();
    this.database = undefined;
    this.initialized = false;
  }

  private async readExistingDatabase(): Promise<Uint8Array | undefined> {
    try {
      return await readFile(this.databasePath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async persist(): Promise<void> {
    const snapshot = Buffer.from(this.getDatabase().export());
    this.writeQueue = this.writeQueue.then(() => writeFile(this.databasePath, snapshot));
    await this.writeQueue;
  }

  private getDatabase(): Database {
    if (!this.database || !this.initialized) {
      throw new Error("SQLite metadata storage is not initialized.");
    }
    return this.database;
  }
}

function optionalString(value: initSqlJs.SqlValue): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: initSqlJs.SqlValue): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseStringArray(value: initSqlJs.SqlValue): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function parseJson(value: initSqlJs.SqlValue): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseCachedLoad(value: initSqlJs.SqlValue): Load | undefined {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const candidate = parsed as Partial<Load>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.externalId !== "string" ||
    typeof candidate.source !== "string" ||
    !candidate.pickup ||
    !candidate.delivery ||
    !Array.isArray(candidate.vehicles) ||
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.status !== "string"
  ) return undefined;
  return candidate as Load;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
