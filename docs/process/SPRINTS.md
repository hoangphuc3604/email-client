# Sprints & Definition of Done

We operate on weekly sprints (Monday–Sunday) to deliver features incrementally.

## Sprint cadence
- **Planning**: Monday 10:00 (VN) — review backlog, capacity, priorities.
- **Daily standup**: Async standup in Slack (#email-client-dev) before 10:30 (VN).
- **Backlog refinement**: Wednesday 16:00 — ensure next sprint stories meet INVEST.
- **Demo & retro**: Sunday 15:00 — show progress, capture learnings.

## Definition of Ready
- User story linked to epic and acceptance criteria documented.
- API contract (if applicable) described in `02-api/openapi.yaml`.
- Dependencies (OAuth credentials, third-party APIs) enumerated with owners.
- Test notes and monitoring expectations captured.

## Definition of Done
- Code merged to `develop` with passing CI (lint, unit/integration tests).
- OpenAPI schema and typed clients updated.
- Documentation updated (README, ADR, or runbook as needed).
- Feature flags, configs, and infrastructure changes validated in staging.
- QA sign-off recorded in `06-qa/ACCEPTANCE_TESTS.md`.

## Current sprint (Week of 2025-11-10)
- **Goal**: Stand up authentication foundation (FastAPI + Mongo) and baseline mail listing.
- **Key stories**:
  - `AUTH-01` — Tenant/user model & passwordless login scaffolding.
  - `AUTH-02` — Google OAuth integration with credential exchange.
  - `MAIL-01` — Sync mailbox list from upstream service (stub until integration).
- **Risks**:
  - OAuth redirect differences between FastAPI backend and Vercel frontend.
  - Mongo schema design requires careful consideration for email data structures.

> Created: 2025-11-13

