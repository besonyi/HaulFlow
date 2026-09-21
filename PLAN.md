# Car Hauler Load Aggregator — Development Plan

## Product direction

Build a Windows desktop tool that gives a car-hauler dispatcher a unified operational view across authorized load-board accounts. Provider-specific details stay behind adapters; the user works with normalized loads, filters, route information, and actionable alerts.

## Phase 1 — Desktop foundation

**Status:** complete

- Establish the Electron + React + TypeScript application shell.
- Add a Tailwind/shadcn-ready UI foundation and persistent sidebar.
- Add Dashboard, Loads, Load Boards, Drivers, and Routes pages.
- Define shared `Load`, `SearchFilters`, and `LoadBoardAdapter` contracts.
- Create the Node-side service and SQLite repository boundaries.
- Add empty adapter implementations for Central Dispatch, Super Dispatch, and Ship.Cars.

**Exit criteria:** the app launches locally on Windows and displays the navigable baseline UI with no live provider access required.

## Phase 2 — Embedded browser and session manager

**Goal:** allow the user to connect their own supported load-board accounts safely.

**Status:** complete — isolated sessions, browser controls, explicit session flushing, SQLite metadata persistence, and restart recovery are implemented and validated for all three configured providers.

- Create one persistent, isolated Electron session partition per provider.
- Present embedded provider browser views from the Load Boards page.
- Let the user complete sign-in and MFA directly on the provider page.
- Display connected, disconnected, and session-expired states without exposing cookies or passwords to the renderer.
- Add a minimal, permissioned IPC API for opening, closing, and clearing a provider session.
- Store only application metadata in SQLite; use OS-backed secure storage where secrets are ever needed.

**Exit criteria:** a user can open a provider view, sign in manually, close and reopen the app, and retain the authorized session where the provider permits it.

## Phase 3 — Session-backed adapter integration

**Status:** complete — persistent session replay and normalized load mapping are implemented for Central Dispatch, Super Dispatch, and Ship.Cars.

- Observe and validate the load-search endpoint used by each authenticated provider page.
- Implement adapter health checks and a normalized load-fetch interface.
- Add source attribution, refresh timestamps, error states, and safe retry behavior.
- Keep session credentials and raw responses in memory; persist only safe metadata and normalized loads when storage is added.

**Exit criteria:** at least one connected session can populate normalized `Load` records locally.

## Phase 4 — Unified load feed

**Status:** complete — live refresh, source counts, freshness indicators, provider-side route search, price/distance filters, sorting, strong-match deduplication, and SQLite-backed saved searches are implemented.

- Build the searchable Loads workspace.
- Apply `SearchFilters` across source, equipment, origin/destination, date, price, and status.
- Support saved views, source-aware refresh, duplicate detection, and data freshness indicators.
- Make source-specific fields discoverable without breaking the shared load model.

**Exit criteria:** dispatchers can review and narrow loads from connected providers in one consistent feed.

## Phase 5 — Drivers, routing, and profitability

**Status:** deferred by product decision

- Add driver, truck, trailer, capacity, and availability records.
- Add route distance, deadhead, estimated cost, and revenue-per-mile calculations.
- Surface compatible loads and simple route/profit scores.
- Keep every score explainable: show the data and assumptions behind it.

**Exit criteria:** the app can compare opportunities against a selected driver's equipment and planned route.

## Phase 6 — Alerts and operations

**Status:** in progress — local, persistent alert rules for load opportunities and source health are available in the Alerts workspace. New-load, price, and rate rules evaluate after each load refresh, retain low-noise baselines, write an activity history, and show Windows notifications. User-controlled auto-refresh runs every 30 seconds to 30 minutes while the app is open and evaluates both new loads and source health. The last 24 hours of normalized loads are cached locally for a clearly labelled offline fallback.

- Add configurable notifications for new matches, rate thresholds, expiring sessions, and adapter failures.
- Add activity history, refresh controls, and operational diagnostics.
- Improve offline behavior and recovery from provider-side changes.

**Exit criteria:** dispatchers receive useful, low-noise alerts and can diagnose a source that needs attention.

## Phase 7 — Production readiness

- Package and sign a Windows release.
- Add migration, backup, update, telemetry/privacy, and support policies.
- Complete security review of IPC, session isolation, local data, and updater paths.
- Add integration tests with approved provider test environments or fixtures.

**Exit criteria:** the app can be installed, updated, backed up, and supported as a reliable daily desktop tool.

## Guiding constraints

- Respect each provider's terms, permissions, and approved integration mechanisms.
- Treat browser sessions and user data as sensitive local data.
- Keep adapters independent so a provider change does not destabilize the rest of the app.
- Prefer transparent calculations and source attribution over opaque ranking.
