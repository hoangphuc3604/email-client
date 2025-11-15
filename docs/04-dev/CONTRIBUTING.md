# Contributing Guide

## Branch workflow
- Fork from `develop`, create `feature/<story-id>-<slug>`.
- Keep branches short-lived; rebase against `develop` daily.

## Coding standards
- **Backend**: Ruff + MyPy strict mode, FastAPI routers per domain (`app/api/auth.py` etc).
- **Frontend**: ESLint + Prettier. Use TypeScript strict mode.
- **Shared types**: OpenAPI schema generates TypeScript client via `pnpm generate:client`.

## Commit conventions
- Conventional commits (`feat:`, `fix:`, `docs:`).
- Reference Jira IDs (e.g. `feat(auth-01): add magic link API`).

## Pull requests
- Include summary, testing evidence, screenshots (frontend).
- Update docs & ADRs if architectural changes.
- Ensure OpenAPI schema regenerated (`python scripts/generate_openapi.py`).

## Testing
- Backend unit tests with pytest (`pytest app`).
- Integration tests hitting FastAPI app + Mongo test database.
- Frontend component tests with Vitest.
- End-to-end tests (Playwright) tracked in `06-qa/TEST_STRATEGY.md`.

## Code review
- Self-review before requesting reviewers.
- Highlight risk areas, new configs, migrations.
- Resolve comments promptly; re-request review if major changes.

## Security
- Do not commit secrets; use `.env.example` for placeholders.
- Run `trufflehog` pre-commit if modifying new secrets handling.

> Questions? Ping `#email-client-dev` channel.

