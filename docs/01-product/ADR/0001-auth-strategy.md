# ADR 0001 — Authentication architecture choices

## Status
Proposed — 2025-11-13

## Context
- The application requires modern authentication supporting both email/password and Google OAuth.
- We need to support both magic-link and Google OAuth with secure session handling (session cookies, redirect URIs).
- Configuration approach should follow `cqtpos-be` (Pydantic Settings, environment-based overrides).

## Decision
- Use FastAPI with custom JWT handling and Google OAuth integration via `google-auth` library.
- Store users and refresh tokens in MongoDB collections (`users`, `refresh_tokens`).
- Backend issues JWT tokens: access token (15 min expiry) and refresh token (7 days expiry).
- **Token storage strategy (Stretch Goal Implementation)**:
  - Access token stored in-memory (React state/context) - not persisted to localStorage or cookies
  - **Refresh token stored in HttpOnly cookie** - secure, cannot be accessed by JavaScript
  - Cookie configuration adapts to environment:
    - Development: `secure=false, samesite=lax` (allows HTTP localhost)
    - Production: `secure=true, samesite=strict` (requires HTTPS)
    - Cross-origin: `samesite=none` (when FE dev with deployed BE)
  - Rationale: HttpOnly cookie provides XSS protection while enabling automatic token transmission
- **Refresh token validation**: Server validates refresh token exists in database before issuing new access token
- **Token revocation**: Logout endpoint removes refresh token from database and clears cookie
- Manage configuration via `settings.py` using Pydantic Settings with `.env` file support.

## Consequences
- Frontend implements standard OAuth flows with API base URL configuration.
- Access token must be re-obtained on every page refresh (via refresh token), adding a small latency overhead.
- HttpOnly cookie approach provides strong XSS protection:
  - JavaScript cannot read refresh token
  - Cookies automatically sent with requests (simpler client code)
  - Server-side validation prevents unauthorized token usage
- API client must:
  - Set `withCredentials: true` to send cookies with requests
  - Handle automatic token refresh with concurrency protection
  - Implement silent token refresh before expiration (proactive refresh)
- Environment-aware cookie configuration enables smooth development workflow:
  - Local dev works without HTTPS setup
  - Production enforces strict security policies
- Database-backed token storage enables immediate revocation on logout/security events.
- No Redis dependency required for MVP (future enhancement for distributed systems).

## Alternatives considered
1. **Refresh token in localStorage** — Rejected due to:
   - Vulnerable to XSS attacks
   - JavaScript can read and exfiltrate token
   - Assignment suggested this but we chose more secure approach
2. **Both tokens in localStorage** — Rejected due to maximum XSS vulnerability.
3. **Session-only auth (no JWT)** — Rejected to maintain compatibility with SPA and mobile clients.
4. **HttpOnly cookie for both tokens** — Rejected because:
   - Access token needs to be readable by client for API calls
   - Would require all API calls to be cookie-based
5. **Access token in localStorage** — Rejected due to higher XSS risk (access token used frequently).
6. **Refresh token in-memory only** — Rejected due to poor UX (logout on every page refresh).
7. **Refresh token in request body** — Rejected because:
   - Requires client to manage token storage (localStorage = XSS risk)
   - More complex client implementation
   - Cookie approach is simpler and more secure

