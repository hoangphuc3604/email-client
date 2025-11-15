# OpenAPI Spec

- Primary OpenAPI document lives at `docs/02-api/openapi.yaml`.
- Source of truth for FastAPI path operations (generated via `fastapi.openapi.utils.get_openapi`).
- Update after adding routes (CI fails if schema drift detected).

## Key sections to maintain
- `Auth` — Magic link, OAuth, session management.
- `Mail` — Threads, messages, compose, attachments.
- `Admin` — Connectors, feature flags, SMTP config.
- `Status` — Health, sync status, build info.

> Regenerate schema via `scripts/generate_openapi.py` (to be added).

