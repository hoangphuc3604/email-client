# MVP Scope — Email Client

## In scope (This Week — Assignment Sprint)
- **Authentication (Email + Password + Google Sign-In)**
  - Email/password login form with client-side validation
  - Google OAuth Sign-In integration (credential exchange with backend)
  - Access token (in-memory) and refresh token (localStorage) management
  - Automatic token refresh on 401 responses with concurrency handling
  - Protected routes with redirect to /login
  - Logout functionality clearing all tokens
- **Email Dashboard Mockup (3-Column Layout)**
  - Responsive three-column layout: Folders (left ~20%), Email List (center ~40%), Email Detail (right ~40%)
  - Mock API endpoints: GET /mailboxes, GET /mailboxes/:id/emails, GET /emails/:id
  - Mock API implementation: Can use static JSON files, mock API library (e.g., MSW, json-server), or local mock server
  - Mock API returns realistic sample data: sender name, subject, preview text, timestamps, message body, attachments
  - Folder navigation, email selection, detail view with actions (Reply, Forward, Delete, Star, etc.)
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
- Real email provider integration (Gmail, IMAP) — using mock data only
- Full-text search and advanced filters (requires Elastic/OpenSearch)
- Offline caching in frontend
- Multi-language localization
- Shared inbox/collaboration features
- Advanced AI agents (auto triage, auto reply execution)
- Mobile-specific UI adjustments beyond basic responsive collapse
- Magic-link authentication (future)
- Admin settings and feature flags (future)

## Assumptions
- All email data comes from mock API (static JSON files, mock API library like MSW/json-server, or local mock server)
- Authentication endpoints can be real FastAPI backend or mocked (for assignment purposes)
- Google OAuth credentials provisioned for development (Google Cloud Console OAuth client ID)
- Token storage: access token in-memory (React state/context), refresh token in localStorage (with security justification in README)
- API client handles automatic token attachment and refresh with concurrency protection (single refresh call for multiple simultaneous 401s)

## Success criteria
- Complete authentication flow (email/password + Google) working end-to-end
- Token refresh mechanism handles expiry and concurrent requests correctly
- Three-column email dashboard displays mock data correctly
- Protected routes redirect unauthenticated users
- App deployed to public hosting with accessible URL
- README includes setup instructions, deployment URL, and token storage justification

> Updated: 2025-11-13 — Focused on Assignment Week requirements

