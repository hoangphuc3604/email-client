# User Stories — Detailed

## AUTH-01 — Passwordless login
- **Description**: User submits email, receives magic-link that signs them in via FastAPI endpoint.
- **Acceptance**:
  - [ ] API `POST /api/v1/auth/magic-link` validates email, rate limits (5/min).
  - [ ] Email template matches application branding.
  - [ ] Link expires in 15 minutes, single use.
  - [ ] Successful login returns access + refresh tokens (HTTP-only cookies).
  - [ ] Audit log entry created.
- **Edge cases**:
  - Invalid email => 400 with localized error.
  - Unknown email creates ghost user only if `auto_provision` flag enabled.
- **Dependencies**: SMTP relay credentials, `cqtpos-be` style settings module.

## AUTH-02 — Google OAuth
- **Description**: Users authenticate with Google and consent to Gmail scopes.
- **Acceptance**:
  - [ ] OAuth flows initiated from frontend route `/auth/google`.
  - [ ] Backend handles callback via `/api/v1/auth/oauth/google/callback`.
  - [ ] Tokens stored encrypted, refresh token rotation supported.
  - [ ] Onboarding wizard prompts for mailbox selection if multiple accounts.
- **Edge cases**:
  - Denied consent -> redirect to `/auth/error`.
  - Secondary accounts flagged for manual approval if domain mismatch.
- **Dependencies**: Google Cloud project, secrets in Vault, domain whitelist.

## MAIL-01 — Inbox listing
- **Description**: Display list of threads with unread badge, snippet, timestamp.
- **Acceptance**:
  - [ ] API `GET /api/v1/mail/threads` returns paginated list with `next_cursor`.
  - [ ] Query parameters `label`, `unread`, `search` supported (search optional for MVP).
  - [ ] Response includes `ai_summary_available` boolean.
  - [ ] Frontend uses SWR with 30s revalidate.
- **Edge cases**:
  - Empty inbox -> show empty state with CTA to connect mailbox.
  - Sync lag -> show banner warning (data from `/api/v1/status/sync`).
- **Dependencies**: Mongo indexes on `tenant_id`, `labels`, `updated_at`.

## COMPOSE-01 — Compose message
- **Description**: Provide compose drawer with recipients, subject, rich text editor.
- **Acceptance**:
  - [ ] Draft stored via `POST /api/v1/mail/drafts`.
  - [ ] Attachments uploaded to S3-compatible storage (MinIO in dev).
  - [ ] Autosave triggered every 10s via WebSocket message.
  - [ ] Sending uses `POST /api/v1/mail/send` with SMTP fallback queue.
- **Edge cases**:
  - Attachment > 25MB blocked with proper error.
  - Offline detection triggers retry banner.
- **Dependencies**: Storage bucket, background worker queue.

## SET-02 — Feature flags
- **Description**: Admin toggles AI features.
- **Acceptance**:
  - [ ] API `PATCH /api/v1/admin/feature-flags/{key}` updates Mongo document.
  - [ ] Frontend invalidates SWR caches on success.
  - [ ] Changes audited.
- **Edge cases**:
  - Unknown feature key returns 404.
  - Toggles restricted to admins (RBAC).

> Keep stories synced with project management system.

