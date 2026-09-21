# Car Hauler Load Aggregator

A Windows desktop workspace for dispatchers to work from one screen while keeping each load-board account and browser session separate. Phase 2 adds embedded, persistent provider sessions on top of the Phase 1 application shell.

## Phase 1

This scaffold includes:

- Electron + React + TypeScript application structure.
- A Tailwind/shadcn-ready renderer foundation and sidebar navigation.
- Dashboard, Loads, Load Boards, Drivers, and Routes pages.
- A Node-side service layer, shared domain types, and a SQLite storage boundary.
- Separate load-board adapter boundaries, with stubs for Central Dispatch, Super Dispatch, and Ship.Cars.

Phase 1 deliberately did **not** connect to, automate, scrape, or store credentials for any load board.

## Phase 2

The Load Boards page now includes:

- One persistent Electron session partition for Central Dispatch, Super Dispatch, and Ship.Cars.
- An embedded provider browser controlled by the Electron main process.
- Manual provider sign-in and MFA inside the provider page.
- Back, forward, reload, home, close, and clear-session controls.
- Connected, disconnected, expired, and error states derived without exposing cookies to React.
- Local SQLite metadata for connection state, provider host, and last-opened timestamps.
- A validated IPC surface restricted to the trusted app renderer.
- Session-backed endpoint discovery and readiness states for every provider.

The app does not read passwords or MFA codes and does not automate provider actions. Cookies and authorization data remain in Electron's isolated persistent browser partitions; SQLite stores only non-sensitive application metadata. Clearing a session removes that provider partition's local browser data and requires a new sign-in.

## Requirements

- Windows 10/11
- Node.js 20 or newer
- pnpm 9 or newer (or enable the version bundled with Node using `corepack enable`)

## Run locally

```powershell
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` starts the renderer development server and opens the Electron desktop window.

### Optional Google city and ZIP suggestions

The location fields use the bundled U.S. city/ZIP directory by default. To make Google Places
the primary suggestion source, enable **Places API (New)** and billing in a Google Cloud project,
restrict the key to the Places API, and start the app with the key in the main-process environment:

```powershell
$env:GOOGLE_MAPS_API_KEY="your-key"
pnpm dev
```

The key is never exposed through the React bridge. If Google is not configured, unavailable, or
returns no match, the app automatically falls back to the local directory. A distributed desktop
key cannot be treated as a permanent secret; a production multi-user release should route Google
requests through an authenticated backend with quotas and key restrictions.

## Useful commands

```powershell
pnpm typecheck  # Validate TypeScript
pnpm lint       # Run lint checks
pnpm build      # Create a production build
pnpm start      # Launch the built desktop app
```

If packaging has been enabled for the environment, use `pnpm package` to create a Windows distributable.

## Architecture

```text
src/
├── main/                 Electron main process and safe IPC surface
├── preload/              Narrow, typed API exposed to the renderer
├── renderer/             React UI, pages, components, and navigation
├── backend/              Local Node services and application orchestration
│   ├── adapters/         Load-board-specific integration boundaries
│   │   ├── central-dispatch/
│   │   ├── super-dispatch/
│   │   └── ship-cars/
│   ├── database/         Local SQLite metadata and future migrations
│   └── repositories/     Storage seams and Phase 1 sample data
└── shared/               Types and contracts used on both sides of the app
```

The renderer does not talk to a load board directly. It requests app actions through the narrowly scoped Electron bridge; local services select an adapter and return normalized domain data. This keeps provider-specific code isolated and makes future sources easier to add.

### Unified load feed

The Loads page translates origin/destination and supported pricing controls into each provider's own session-backed search request before results are downloaded. This preserves provider radius behavior and avoids filtering only the first page of an unrelated search. It also shows source counts and refresh time, applies remaining local filters and sorting, and merges strong cross-board matches only when route postal codes, vehicle details, pickup date, and price agree. Named searches are stored locally in SQLite and can be reapplied or deleted from the page.

### Core domain contracts

- `Load` represents a normalized shipment opportunity, independent of its source.
- `SearchFilters` describes a reusable query for the unified feed.
- `LoadBoardAdapter` defines the provider boundary: connection state, load retrieval, and future session-aware operations.

## Phase 3: session-backed adapter integration

The app discovers the HTTPS search endpoints used by an authenticated provider page. The most recent successful search request is retained only in process memory and replayed through the same isolated Electron session; cookies and authorization headers are never sent to React or written to SQLite. Central Dispatch, Super Dispatch, and Ship.Cars responses are normalized into the unified `Load` model. Each adapter refresh is independent, so one source failure cannot break the unified feed.

See [PROVIDER_INTEGRATION.md](PROVIDER_INTEGRATION.md) for the provider audit and [PLAN.md](PLAN.md) for the complete roadmap.
