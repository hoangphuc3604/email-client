# Test Strategy

## Layers
- **Unit tests**: Python pytest for service logic; Vitest for frontend utilities/components.
- **Integration tests**: FastAPI endpoints with TestClient + Mongo test DB; cover auth, inbox, compose.
- **Contract tests**: Validate OpenAPI schema against frontend expectations using generated client.
- **E2E tests**: Playwright flows (login, view inbox, compose send) running against staging.
- **Performance tests**: Locust (targeting auth + inbox) before each release.

## Tooling
- Backend: pytest, factory-boy, httpx.
- Frontend: Vitest, Testing Library, MSW for API mocks.
- E2E: Playwright with fixtures seeding Mongo.
- Load: Locust or k6.

## Environments
- Unit/integration: CI ephemeral containers.
- E2E: Dedicated staging with seeded sample data.

## Test data
- Use fixtures in `tests/fixtures` to seed tenants/users/mailboxes.
- For OAuth, use Google test accounts with limited scopes.

## Reporting
- Coverage thresholds: Backend 85%, Frontend 80%.
- Publish Playwright videos on CI artifacts.
- Trend metrics in Allure (optional).

> Keep acceptance tests listed in `ACCEPTANCE_TESTS.md` updated per release.

