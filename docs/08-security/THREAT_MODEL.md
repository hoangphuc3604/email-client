# Threat Model

## Assets
- User emails, attachments, and metadata.
- JWT access tokens (15 min expiry) and refresh tokens (7 days).
- Google OAuth credentials.
- User authentication data (email, password hashes).
- Session data and authentication state.

## Entry points
- FastAPI endpoints (`/api/v1/*`).
- WebSocket connections for real-time updates.
- Background sync workers connecting to external providers.
- Admin settings UI.

## Threats & mitigations
- **XSS attacks (refresh token theft)**  
  - Refresh tokens stored in HttpOnly cookies (JavaScript cannot access).
  - Access tokens in-memory only, never persisted to localStorage.
  - CSP headers on frontend to prevent script injection.
  - Input sanitization on all user-provided data.
- **CSRF attacks on token endpoints**  
  - SameSite cookie policy (strict in production, lax in dev).
  - CORS configured with explicit allowed origins.
  - Credentials required for all authenticated endpoints.
- **Token replay attacks**  
  - Refresh tokens stored in database, validated on each use.
  - Tokens can be revoked immediately via database deletion.
  - Short-lived access tokens (15 min) limit exposure window.
- **Man-in-the-middle attacks**  
  - Enforce HTTPS in production (secure cookie flag).
  - Development allows HTTP for localhost testing.
- **OAuth credential compromise**  
  - Google OAuth tokens verified server-side with Google's API.
  - User data fetched from verified token payload only.
  - No client-side token validation.
- **MongoDB injection**  
  - Use Pydantic models and typed queries.
  - Validate all user input.
  - Parameterized queries prevent injection.
- **Brute force attacks**  
  - Rate limiting on login endpoints (future: implement with Redis).
  - Account lockout after failed attempts (future enhancement).
- **Session hijacking**  
  - Tokens bound to user ID, validated on each request.
  - Database lookup prevents use of revoked tokens.
  - Logout clears both cookie and database entry.

## Security controls
- JWT signed with HS256 algorithm and strong secret key.
- HttpOnly cookies prevent JavaScript access to refresh tokens.
- Environment-aware cookie configuration (secure, samesite attributes).
- Secrets managed via environment variables, never committed to repo.
- CORS configured with explicit allowed origins and credentials.
- Password hashing using industry-standard algorithms.
- Token validation includes database lookup to prevent revoked token usage.
- Regular dependency scanning recommended (pip-audit, safety).

## Open issues
- Implement rate limiting for authentication endpoints.
- Add refresh token rotation (issue new refresh token on each use).
- Consider adding CSRF tokens for additional protection.
- Implement account lockout after failed login attempts.
- Add security headers (X-Content-Type-Options, X-Frame-Options, etc.).
- Set up automated security scanning in CI/CD pipeline.

> Review threat model quarterly or after major features.

