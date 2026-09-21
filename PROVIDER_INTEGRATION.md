# Provider Integration Readiness

Reviewed against official provider documentation on 2026-09-18. The current product decision is to read the same session-backed HTTPS endpoints used by each provider's browser UI instead of requiring separate API credentials. These endpoints are undocumented and may change without notice.

## Session endpoint discovery

The desktop app observes provider-domain XHR/fetch traffic while the user operates the embedded browser. SQLite records only the HTTP method, origin, sanitized path template, query-parameter names, response status, timestamps, observation count, and response field shape. The latest complete search request—including the minimum headers/body needed to repeat it—is retained in process memory only. Cookie values, token values, request bodies, and response bodies are never written to SQLite or sent to React.

To map a provider, open its saved session, perform a normal load search and adjust at least one filter, then refresh the observed-endpoints list below the browser. Captured paths are reviewed before any response reader or automated refresh is enabled.

## Central Dispatch

- Official portal: <https://api-docs.centraldispatch.com/>
- Documented capabilities: customer listings, assigned fulfillment/dispatch records, documents, events, membership, and optional market intelligence.
- Access: provider-issued OAuth credentials; availability depends on the Central Dispatch plan. A test marketplace and test credentials are available through provider onboarding.
- Session integration: `POST https://bff.centraldispatch.com/listing-search/api/open-search` is captured from the signed-in search page and normalized locally.
- Status: response mapping is implemented; live results require a successful search in the current app process.

## Super Dispatch

- Official portal: <https://developer.superdispatch.com/>
- Documented carrier capabilities: assigned order/load management, offers, drivers, status updates, documents, inspections, invoices, and webhooks.
- Access: subscription-based API feature with OAuth client credentials and a provider test account.
- Session integration: `POST https://api.loadboard.superdispatch.com/internal/v3/loads/search` is captured from the signed-in loadboard page.
- Status: response mapping is implemented; the adapter converts route, schedule, vehicles, price, distance, and status into the shared load model.

## Ship.Cars

- Official portal: <https://shipcars.readme.io/>
- Documented capabilities: OAuth-authenticated loadboard search through `GET /api/loadboard/v3/postings`, plus CTMS loads and trips.
- Access: provider-issued OAuth credentials; carrier pricing describes API integration capabilities as a Professional-plan feature.
- Session integration: `GET https://ship.cars/api/cube/loadboard/v3/platform-web/postings` is captured from the signed-in loadboard page and normalized locally.
- Status: response mapping is implemented; live results require a successful search in the current app process.

## Security boundary

- Browser cookies remain in isolated Electron partitions. Session-backed requests execute through the matching Electron partition and never expose cookie values to application code or React.
- Provider client secrets and access tokens must not be stored in SQLite in plain text.
- Session-backed calls will use HTTPS endpoints observed during the user's own authenticated workflow and will remain restricted to the matching provider session and host allowlist.
- One provider failure must return a source-specific warning without breaking results from other sources.
