# User Stories — Summary

## Authentication (Assignment Week Focus)
- **AUTH-00**: As a new user, I can register an account with my email and password so I can access the email dashboard.
- **AUTH-01**: As a user, I can login with my email and password so I can access my email dashboard.
- **AUTH-02**: As a user, I can sign in with Google so I can quickly authenticate without entering credentials.
- **AUTH-03**: As a user, I can see validation errors on the login form so I know what to fix.
- **AUTH-04**: As a user, my access token is automatically refreshed when it expires so I don't get logged out unexpectedly.
- **AUTH-05**: As a user, I can logout so my session is securely ended and tokens are cleared.
- **AUTH-06**: As an unauthenticated user, I am redirected to login when accessing protected routes.

## Email Dashboard (Assignment Week Focus)
- **DASH-01**: As a user, I can see a three-column layout (folders, email list, email detail) so I can navigate my emails efficiently.
- **DASH-02**: As a user, I can select a folder from the left sidebar so I can view emails in that folder.
- **DASH-03**: As a user, I can see a list of emails with sender, subject, preview, and timestamp so I can quickly scan my inbox.
- **DASH-04**: As a user, I can select an email from the list so I can view its full content in the detail pane.
- **DASH-05**: As a user, I can see email actions (Reply, Forward, Delete, Star) so I can manage my emails.
- **DASH-06**: As a user, I can navigate emails using keyboard shortcuts so I can work efficiently.
- **DASH-07**: As a mobile user, I see a responsive layout that collapses to single-column view so I can use the app on small screens.

## Mailbox (Future)
- **MAIL-01**: As a user, I can view my inbox with unread indicator and pagination.
- **MAIL-02**: As a user, I can open a thread and read messages with formatted content.
- **MAIL-03**: As a user, I can mark a thread as read/unread or starred.
- **MAIL-04**: As a user, I can view an AI-generated summary of the thread.

## Compose (Future)
- **COMPOSE-01**: As a user, I can create a new message with recipients, subject, body.
- **COMPOSE-02**: As a user, my draft is autosaved while I type.
- **COMPOSE-03**: As a user, I can send the composed email and see success/failure feedback.
- **COMPOSE-04** *(later)*: As a user, I can schedule a message to send later.

## Settings & Admin (Future)
- **SET-01**: As an admin, I can connect my Google account to sync inbox data.
- **SET-02**: As an admin, I can toggle AI features for my workspace.
- **SET-03**: As an admin, I can configure SMTP credentials used for sending emails.

## Observability (Future)
- **OBS-01**: As an operator, I can view metrics for authentication success/failure.
- **OBS-02**: As an operator, I can receive alerts when sync workers fail or lag.

> Detailed acceptance criteria live in `06b-USER_STORIES_DETAILED.md` and `07-ACCEPTANCE_CRITERIA.md`.

