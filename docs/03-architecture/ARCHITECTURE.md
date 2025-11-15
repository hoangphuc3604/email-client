# System Architecture

- High-level architecture described in `01-product/diagrams/system-architecture.md`.
- Services (FastAPI modules):
  - `auth` — JWT issuance, OAuth flows.
  - `mail` — Threads, messages, compose.
  - `sync` — Background workers (Celery/RQ).
  - `agents` — AI integrations.
  - `admin` — Connectors, feature flags.
- Backend follows modular structure inspired by `cqtpos-be`:
  - `app/config.py` — Pydantic Settings (env-driven).
  - `app/api/*` — Routers grouped by domain.
  - `app/core/` — Shared dependencies, middleware.
  - `app/models/` — Pydantic models & Mongo schema definitions.
- Inter-service communication via Redis pub/sub queues.
- Observability pipeline: OpenTelemetry → Collector → Prometheus/Grafana + Loki.

## Deployment overview
- Backend container built with `uv` or `poetry`, served via Uvicorn/Gunicorn.
- Frontend deployed via Vercel (SSG+SSR).
- MongoDB cluster hosted on Atlas (private network).
- Redis deployed via AWS ElastiCache or self-managed.
- Attachments stored on S3-compatible storage with signed URLs.

> Refer to `05-infra/DEPLOYMENT_RUNBOOK.md` for environment specifics.

