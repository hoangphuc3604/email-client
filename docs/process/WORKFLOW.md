# Git & Release Workflow

This workflow defines the development and release processes for the Email Client project using FastAPI + Next.js stack.

## Branching model
- **main** — always deployable; only release-approved changes land here.
- **develop** — integration branch for the upcoming milestone; deploys to staging.
- **feature/<scope>** — short-lived branches per user story (e.g. `feature/auth-login-form`).
- **hotfix/<issue>** — emergency fixes forked from `main`, merged back into both `main` and `develop`.

## Pull request rules
- Link to relevant user stories, epics, and ADRs.
- Include backend/ frontend checklist as applicable:
  - FastAPI routes documented/openapi updated.
  - Mongo indexes or migrations handled via `app/db/migrations`.
  - Frontend type updates (Zod schema, tRPC client) included.
- Require at least two reviewers: module owner + QA or PO.
- CI must pass (lint, tests, type checks) before merge.

## Release flow
1. Cut release branch from `main`: `release/vYYYY.MM.DD`.
2. Staging deploy via GitHub Actions + Docker Compose (FastAPI) + Vercel preview (Next.js).
3. Run regression suite and smoke tests (QA sign-off).
4. Tag release on `main`, publish release notes, merge `release/*` back into `main` and `develop`.
5. Production deploy: backend to Fly.io (container) or AWS ECS (final decision in ADR), frontend to Vercel.

## Environment promotion
- **Local** — developers run `docker compose -f docker-compose.dev.yaml up` for services (FastAPI API, MongoDB, worker).
- **Staging** — automated nightly deploy from `develop`; seeded test accounts.
- **Production** — manual approval required, config sourced from `infrastructure/prod`.

## Feature toggles
- Store toggles in Mongo collection `feature_flags`.
- Frontend reads toggles via `/api/v1/feature-flags`; use SWR caching with 5 min revalidate.
- Document new toggles in `05-infra/CI.md` + `07-ops/MONITORING.md`.

> Created: 2025-11-13

