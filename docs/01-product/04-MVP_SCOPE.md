# MVP Scope — Email Client

## In scope (This Week — Assignment Sprint)
- **Authentication (Email + Password + Google Sign-In)**
  - Email/password login form with client-side validation
  - Google OAuth Sign-In integration (credential exchange with backend)
  - Access token (in-memory) and refresh token (localStorage) management
  - Automatic token refresh on 401 responses with concurrency handling
  - Protected routes with redirect to /login
  - Logout functionality clearing all tokens
- **Email Dashboard (Gmail Integration)**
  - Responsive three-column layout: Folders (left ~20%), Thread List (center ~40%), Thread Detail (right ~40%)
  - Real Gmail API endpoints:
    - GET /mail/mailboxes — List mailboxes/folders from Gmail
    - GET /mail/mailboxes/:id/emails — List threads from Gmail
    - GET /mail/emails/:id — Get full thread detail from Gmail
    - POST /mail/emails/send — Send email via Gmail
    - POST /mail/emails/:id/reply — Reply to email via Gmail
    - POST /mail/emails/:id/modify — Modify email labels (read/unread, star)
  - Thread-based structure: Groups related emails into conversations
  - Efficient loading pattern:
    - Virtual scrolling: Render only visible threads (~10-15 on screen)
    - React Query caching: 1-hour staleTime, no redundant API calls
    - Lazy loading: Fetch thread details on-demand when thread is rendered
  - Folder navigation, thread selection, detail view with all messages, action buttons (Reply, Forward, Delete, Star, etc.)
  - Keyboard accessibility (Arrow keys, Enter, Tab) and responsive mobile fallback (single-column with back button)
- **API Client & Token Management**
  - API client with automatic token attachment (Authorization: Bearer)
  - Token refresh mechanism with single refresh call for concurrent requests
  - Error handling for expired tokens, network failures
- **Form Handling & Validation**
  - Client-side validation for login forms
  - Inline error messages and server error display
  - Loading indicators during authentication
- **Deployment**
  - Public hosting on one of: Netlify, Vercel, Firebase Hosting, or similar platform
  - Public URL accessible and functional
  - README.md must include:
    - Setup and run instructions (local development)
    - Public hosting URL
    - How to reproduce deployment locally
    - Token storage choices and security considerations (justification for access token in-memory, refresh token in localStorage)
    - Third-party services used (Google OAuth client ID, hosting provider)
    - Screenshots or GIF walkthrough demonstrating: login (email), login (Google), token refresh (simulate expiry), logout, and 3-column dashboard

## Out of scope (defer to post-MVP)
- Full-text search and advanced filters (requires Elastic/OpenSearch)
- Offline caching in frontend
- Multi-language localization
- Shared inbox/collaboration features
- Advanced AI agents (auto triage, auto reply execution)
- Mobile-specific UI adjustments beyond basic responsive collapse
- Magic-link authentication (future)
- Admin settings and feature flags (future)

## Assumptions
- Authentication endpoints are real FastAPI backend
- Google OAuth credentials provisioned for development (Google Cloud Console OAuth client ID)
- Token storage: access token in-memory (React state/context), refresh token in localStorage (with security justification in README)
- API client handles automatic token attachment and refresh with concurrency protection (single refresh call for multiple simultaneous 401s)

## Success criteria
- Complete authentication flow (email/password + Google) working end-to-end
- Token refresh mechanism handles expiry and concurrent requests correctly
- Three-column email dashboard displays real Gmail data
- Protected routes redirect unauthenticated users
- App deployed to public hosting with accessible URL
- README includes setup instructions, deployment URL, and token storage justification

> Updated: 2025-11-13 — Focused on Assignment Week requirements

