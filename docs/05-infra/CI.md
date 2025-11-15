# CI Pipeline

## Overview
GitHub Actions orchestrates linting, testing, and build pipelines.

### Workflows
- `ci-backend.yml`
  - Setup Python 3.12.
  - Install dependencies (pip + poetry/uv).
  - Run `ruff check`, `ruff format --check`, `mypy`, `pytest`.
  - Generate OpenAPI schema and ensure clean diff.
- `ci-frontend.yml`
  - Setup pnpm.
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- `ci-e2e.yml`
  - Spin up services via `docker compose`.
  - Run Playwright tests.

### Build artifacts
- Backend Docker image pushed to GHCR `ghcr.io/org/email-client-api`.
- Frontend build artifact uploaded for Vercel deployment.

### Secrets management
- Use GitHub OIDC with cloud provider to fetch secrets at runtime.
- Keep environment-specific secrets in Vault, injected via workflow dispatch.

### Required checks
- `ci-backend`
- `ci-frontend`
- `ci-e2e` (for protected branches)
- `lint-docs` (optional future addition)

> Update when new workflows are added or step changes required.

