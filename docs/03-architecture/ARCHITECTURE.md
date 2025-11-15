# System Architecture

- High-level architecture described in `01-product/diagrams/system-architecture.md`.
- Services (FastAPI modules):
  - `auth` — JWT issuance, OAuth flows (email/password + Google Sign-In).
  - `mail` — Thread-based email operations following Zero's pattern (Mock API for MVP).
  - `sync` — Background workers (Celery/RQ) (future).
  - `agents` — AI integrations (future).
  - `admin` — Connectors, feature flags (future).
- Backend follows modular structure inspired by `cqtpos-be`:
  - `app/config.py` — Pydantic Settings (env-driven).
  - `app/api/*` — Routers grouped by domain.
  - `app/core/` — Shared dependencies, middleware.
  - `app/models/` — Pydantic models & Mongo schema definitions.
- Inter-service communication via Redis pub/sub queues (future).
- Observability pipeline: OpenTelemetry → Collector → Prometheus/Grafana + Loki (future).

## Mail API Architecture (Current Phase - MVP)
Following Zero email client's thread-based pattern:
- **Thread-centric structure**: Emails grouped into threads (conversations)
- **Lightweight listing**: `listThreads` returns only IDs + historyIds
- **Full detail on demand**: Frontend fetches complete thread data via separate endpoint
- **Efficient frontend loading**:
  - Virtual scrolling (render only visible threads)
  - React Query caching (1-hour staleTime, no redundant fetches)
  - Lazy loading (fetch threads as user scrolls)
- **Mock data implementation**: Static mock data following Zero's `ParsedMessage` and `IGetThreadResponse` schemas

## Deployment overview
- Backend container built with `uv` or `poetry`, served via Uvicorn/Gunicorn.
- Frontend deployed via Vercel (SSG+SSR).
- MongoDB cluster hosted on Atlas (private network).
- Redis deployed via AWS ElastiCache or self-managed.
- Attachments stored on S3-compatible storage with signed URLs.

> Refer to `05-infra/DEPLOYMENT_RUNBOOK.md` for environment specifics.

