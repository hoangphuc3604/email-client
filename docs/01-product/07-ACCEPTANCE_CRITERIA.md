# Acceptance Criteria Checklist

## Authentication (Assignment Week)
- [ ] Registration form has client-side validation (email format, password minimum length, name required)
- [ ] Registration form shows inline validation errors and server error messages (e.g., email already exists)
- [ ] Successful registration receives access token (15 min) and refresh token (7 days) from backend
- [ ] After successful registration, user is automatically logged in and redirected to /inbox
- [ ] Email/password login form has client-side validation (email format, password required)
- [ ] Login form shows inline validation errors and server error messages
- [ ] Loading indicator displayed during authentication requests
- [ ] Successful login receives access token (15 min) and refresh token (7 days) from backend
- [ ] Access token stored in-memory (React state/context), not in localStorage
- [ ] Refresh token stored in localStorage (with justification in README)
- [ ] Google Sign-In button triggers OAuth flow
- [ ] Google OAuth handles first-time user (create account) and returning user flows
- [ ] Google OAuth error states displayed to user (invalid credentials, network errors)
- [ ] Access token attached to all protected API requests via `Authorization: Bearer` header
- [ ] Automatic token refresh triggered on 401 Unauthorized responses
- [ ] Token refresh handles concurrency: multiple simultaneous 401s trigger only one refresh call (using queue/promise mechanism to prevent duplicate refresh requests)
- [ ] Failed requests are queued during refresh and retried after new access token is obtained
- [ ] If refresh token expires/invalid, user is logged out (clear tokens) and redirected to /login
- [ ] Network errors during refresh are handled gracefully (show error message, allow retry)
- [ ] Logout clears both access token (in-memory) and refresh token (localStorage)
- [ ] Logout redirects user to /login screen
- [ ] Protected routes (e.g., /inbox) redirect unauthenticated users to /login
- [ ] After successful login, user redirected to /inbox (dashboard)

## Email Dashboard (Assignment Week)
- [ ] Three-column layout implemented: Folders (left ~20%), Email List (center ~40%), Email Detail (right ~40%)
- [ ] Column 1 (Folders): Displays Inbox (with unread count), Starred, Sent, Drafts, Archive, Trash, custom folders
- [ ] Column 1: Selecting a folder updates Column 2's email list
- [ ] Column 2 (Email List): Shows paginated/virtualized list of emails for selected folder
- [ ] Column 2: Each email row displays sender name, subject (ellipsis), preview (ellipsis), timestamp, star indicator, checkbox
- [ ] Column 2: Selecting an email opens it in Column 3
- [ ] Column 2: Actions above list: Compose (opens modal), Refresh, Select All, Delete, Mark Read/Unread
- [ ] Column 3 (Email Detail): Displays from, to, cc, subject, received date/time, body (HTML/plain), attachments (if any)
- [ ] Column 3: Action buttons: Reply, Reply All, Forward, Delete, Mark as Unread, Toggle Star
- [ ] Column 3: Empty state shown when no email selected: "Select an email to view details"
- [ ] Keyboard accessibility: Arrow keys navigate emails, Enter selects, Tab navigates UI elements
- [ ] Responsive: On small screens, shows either list OR detail (with back button), not three columns
- [ ] Typography readable, spacing clear, affordances obvious

## Mock Email API (Assignment Week)
- [ ] GET /mailboxes endpoint returns list of mailboxes (Inbox, Sent, etc.)
- [ ] GET /mailboxes/:id/emails endpoint returns emails in mailbox (supports pagination/filtering)
- [ ] GET /emails/:id endpoint returns full email detail
- [ ] Mock API returns realistic sample data: sender name, subject, preview text, timestamps, message body
- [ ] Mock API can be static JSON files, mock API library, or local mock server
- [ ] All email-related endpoints use mock data (authentication endpoints can be real or mocked)

## Deployment (Assignment Week)
- [ ] App deployed to public hosting platform (Netlify, Vercel, Firebase Hosting, etc.)
- [ ] Public URL accessible and working (no authentication required to access the URL)
- [ ] README.md includes:
  - [ ] Setup and run instructions (prerequisites, installation, local development commands)
  - [ ] Public hosting URL (live link to deployed application)
  - [ ] How to reproduce deployment locally (build commands, environment variables, deployment steps)
  - [ ] Token storage choices and security considerations:
    - [ ] Justification for access token stored in-memory (React state/context) - security benefits
    - [ ] Justification for refresh token stored in localStorage - trade-offs and security considerations
    - [ ] Explanation of token expiry times (access: 15 min, refresh: 7 days)
  - [ ] Third-party services used:
    - [ ] Google OAuth client ID (where to obtain, how to configure)
    - [ ] Hosting provider (Netlify/Vercel/Firebase Hosting) and configuration
  - [ ] Screenshots or GIF walkthrough demonstrating:
    - [ ] Email/password login flow
    - [ ] Google Sign-In flow
    - [ ] Token refresh (simulate expiry scenario)
    - [ ] Logout functionality
    - [ ] 3-column email dashboard with folder navigation, email list, and detail view

## Mailbox (Future)
- [ ] Inbox API supports cursor pagination and returns `total_unread`.
- [ ] Thread payload includes sanitized HTML and plain-text snippet.
- [ ] AI summary placeholder renders within 1 second or shows skeleton loader.
- [ ] Mark read/unread operations idempotent; return latest thread state.

## Compose (Future)
- [ ] Draft autosave persists subject, body, attachments with version timestamp.
- [ ] Sending handles connectivity issues with retry queue (max 3 attempts).
- [ ] Client receives immediate toast notifications for send success/failure.
- [ ] Attachments virus-scanned before send (stubbed locally).

## Settings (Future)
- [ ] Connector OAuth secrets encrypted at rest.
- [ ] Feature flag toggles propagate to frontend within 60 seconds.
- [ ] SMTP credential changes re-validated via test email.

## Observability (Future)
- [ ] Auth flows emit structured logs with correlation IDs.
- [ ] Metrics exported: `auth_success_total`, `auth_failure_total`, `sync_latency_seconds`.
- [ ] Alert configured for sync worker stalled > 5 minutes.

> Update as features evolve. Sync with QA test cases in `06-qa/ACCEPTANCE_TESTS.md`.

