# Software Requirements Specification — Email Client

## 1. Introduction

### 1.1 Purpose
This SRS defines the requirements for building a modern email client application using FastAPI, MongoDB, and Redis with a Next.js frontend. It is the reference for engineering, QA, design, and stakeholders.

### 1.2 Scope
- Provide core mailbox operations (auth, list, read, compose, send).
- Deliver secure, multi-tenant deployment aligned with internal DevSecOps practices.
- Support modern email workflows with AI assistance and extensible connectors.

### 1.3 Definitions & acronyms
- **MTA** — Mail Transfer Agent.
- **MDA** — Mail Delivery Agent.
- **IMAP Bridge** — Background worker syncing messages from external providers.
- **AI Agent** — Worker executing summarization, triage, or automation tasks.

### 1.4 References
- `E:/coqnit/cqtpos-be` FastAPI project structure (configuration reference).
- Smart Restaurant docs (structure baseline).

## 2. Overall description

### 2.1 Product perspective
- Frontend Next.js app communicates with FastAPI backend through REST & WebSocket.
- Backend exposes `/api/v1/*` endpoints following RESTful conventions.
- MongoDB stores tenants, users, mailboxes, threads, messages, feature flags.
- Redis used for sessions, rate limiting, job queues.
- Background workers handle sync and AI tasks (Celery or RQ).

### 2.2 Product functions
1. **Authentication**
   - Email/password login with secure password hashing.
   - OAuth (Google initially) with credential exchange.
   - Passwordless magic-link login (future).
2. **Mailbox management**
   - List mailboxes, threads, and messages.
   - Mark read/unread, archive, star.
3. **Compose & send**
   - Draft autosave.
   - Send via SMTP relay with templated fallback.
4. **Search**
   - Full-text search via Mongo indexes (phase 2).
5. **AI assistance**
   - Summaries, suggested replies via pluggable provider.
6. **Settings**
   - Manage connectors, feature flags, notification preferences.

### 2.3 User characteristics
- Knowledge workers comfortable with modern email clients.
- Admin users with technical capability to manage connectors.
- Support engineers responsible for deployment/monitoring.

### 2.4 Constraints
- Backend must be Python 3.12+, FastAPI, Pydantic v2.
- MongoDB 7 cluster (Atlas or self-hosted) with replica set.
- Frontend uses Next.js 14+ with modern React patterns.
- Deployment must work with Docker Compose & K8s (future).

### 2.5 Assumptions & dependencies
- SMTP relay (e.g. Mailgun, Postmark) available with API credentials.
- OAuth credentials provisioned per tenant.
- Redis cluster shared with other internal services (namespace isolation required).

## 3. Functional requirements

### FR-1 Authentication & Accounts
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-1-001 | Users can login with email and password | Must | Client-side validation, secure password hashing (bcrypt) |
| FR-1-002 | Users can authenticate via Google OAuth (Sign-In) | Must | OAuth flow with credential exchange, handle first-time vs returning users |
| FR-1-003 | Backend issues JWT access + refresh tokens | Must | Access token (15 min, in-memory), refresh token (7 days, localStorage) |
| FR-1-004 | Access token attached to protected API requests | Must | Authorization: Bearer header |
| FR-1-005 | Automatic token refresh on 401 responses | Must | Single refresh call for concurrent requests (queue/promise mechanism), failed requests queued and retried after refresh, handle refresh failure (logout on invalid refresh token) |
| FR-1-006 | Logout clears tokens and redirects to login | Must | Clear in-memory access token and localStorage refresh token |
| FR-1-007 | Protected routes redirect unauthenticated users | Must | PrivateRoute component, redirect to /login |
| FR-1-008 | Form validation and error handling | Must | Inline validation, server error display, loading indicators |
| FR-1-012 | Token refresh error handling | Must | Network errors during refresh show user-friendly message, allow retry; expired/invalid refresh token forces logout and redirect to /login |
| FR-1-009 | Magic-link login (future) | Should | Rate limited (per email, 5/min) |
| FR-1-010 | Admins can invite teammates (future) | Should | Invitation email with one-time token |
| FR-1-011 | Users can revoke active sessions (future) | Should | Display list, revoke via API |

### FR-2 Email Dashboard Mockup (3-Column Layout)
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-2-001 | Three-column responsive layout (folders, list, detail) | Must | Desktop: 20%/40%/40%, mobile: collapse to single-column view with back button navigation between folder/list/detail views |
| FR-2-002 | Column 1: Mailboxes/Folders list | Must | Inbox (unread count), Starred, Sent, Drafts, Archive, Trash, custom folders |
| FR-2-003 | Column 2: Email list for selected folder | Must | Sender, subject (ellipsis), preview, timestamp, star indicator, checkbox |
| FR-2-004 | Column 2: Email list actions | Must | Compose (modal), Refresh, Select All, Delete, Mark Read/Unread |
| FR-2-005 | Column 3: Email detail view | Must | From, to, cc, subject, date/time, body (HTML/plain), attachments |
| FR-2-006 | Column 3: Email detail actions | Must | Reply, Reply All, Forward, Delete, Mark Unread, Toggle Star |
| FR-2-007 | Empty state when no email selected | Must | "Select an email to view details" message |
| FR-2-008 | Keyboard accessibility for navigation | Must | Arrow keys (↑/↓) navigate emails, Enter selects email, Tab navigates UI elements, Escape closes modals |
| FR-2-009 | Mock API endpoints for email data | Must | GET /mailboxes, GET /mailboxes/:id/emails, GET /emails/:id |

### FR-3 Mailbox & Threads (Future)
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-3-001 | List mailboxes (Inbox, Starred, AI folders) | Should | Paginated, cached |
| FR-3-002 | List threads with filters (read/unread, label) | Should | Supports cursor pagination |
| FR-3-003 | View thread detail with message bodies | Should | HTML sanitized |
| FR-3-004 | Mark thread read/unread, archive, star | Should | Update remote provider if supported |
| FR-3-005 | AI summary available per thread | Could | Async job, store in Mongo |

### FR-4 Compose & Send (Future)
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-4-001 | Create draft with subject/body/attachments | Should | Stored in Mongo GridFS |
| FR-4-002 | Autosave draft every 10 seconds | Should | WebSocket push |
| FR-4-003 | Send email via configured SMTP | Should | Retry on transient failure |
| FR-4-004 | Schedule send (phase 2) | Could | Cron-based worker |

### FR-5 Settings & Admin (Future)
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-5-001 | Manage connectors (Gmail/OAuth) | Should | Store secrets encrypted |
| FR-5-002 | Configure inbound custom domain | Could | Via DNS + webhook |
| FR-5-003 | Toggle AI features per tenant | Should | Feature flag document |
| FR-5-004 | View audit log | Should | Stream to Elasticsearch (future) |

## 4. Non-functional requirements

### 4.1 Performance
- Inbox list P95 < 300ms (cached), thread detail P95 < 500ms.
- Sync worker processes at least 300 messages/min.

### 4.2 Security
- JWT and refresh tokens signed & rotated.
- Secrets stored via Hashicorp Vault (or AWS Secrets Manager).
- OWASP ASVS L2 baseline; static analysis integrated in CI.

### 4.3 Reliability
- Mongo replica set with point-in-time backups.
- Redis persistence (AOF) enabled; TTL for sessions 7 days.
- Graceful degradation when AI provider unavailable.

### 4.4 Maintainability
- Domain-driven service modules (auth, mail, sync, agents).
- Config via Pydantic `Settings` (inspired by `cqtpos-be/config.py`).
- ADR required for architectural changes.

### 4.5 Compliance
- GDPR-ready: ability to export & delete user data.
- Audit logging for auth events and message access.

## 5. Appendices
- Appendix A: API endpoint reference (see `02-api/openapi.yaml`).
- Appendix B: Glossary of mail sync terms.

> Version: 0.1.0 (2025-11-13) — See `03-SRS_CHANGELOG.md` for updates.

