# OpenAPI Spec

- Primary OpenAPI document lives at `docs/02-api/openapi.yaml`.
- Source of truth for FastAPI path operations (generated via `fastapi.openapi.utils.get_openapi`).
- Update after adding routes (CI fails if schema drift detected).

## Key sections to maintain
- `Auth` — Email/password, Google OAuth, token refresh, logout.
- `Mail` — Thread list, thread detail, mailbox listing, search (Mock API following Zero's structure).
- `Admin` — Connectors, feature flags, SMTP config (future).
- `Status` — Health, sync status, build info (future).

## Mail API Structure (Current Phase - Mock Implementation)
Following Zero email client's architecture:
- **GET /mail/mailboxes** — List all mailboxes/folders
- **GET /mail/mailboxes/:id/emails** — Get thread IDs (lightweight, returns only `{ id, historyId }`)
- **GET /mail/emails/:id** — Get full thread detail with all messages (`IGetThreadResponse`)
- **POST /mail/emails/search** — Search threads by query

### Data Flow Pattern (Zero-inspired)
1. Frontend calls `listThreads` → receives thread IDs only
2. Virtual list renders visible threads
3. Each thread component calls `GET /emails/:id` for full data
4. React Query caches thread data with 1-hour staleTime
5. Lazy loading + caching minimizes redundant requests

> Regenerate schema via `scripts/generate_openapi.py` (to be added).

