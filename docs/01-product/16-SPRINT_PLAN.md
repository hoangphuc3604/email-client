# Sprint Plan — Assignment Week (2025-11-13)

## Goal
Deliver complete React authentication system (Email+Password + Google Sign-In) with token management and a polished 3-column email dashboard mockup consuming mock API data.

## Capacity
- Full-stack Developer — 5d (focus on auth + dashboard)
- Backend Developer — 3d (FastAPI auth endpoints, mock email API)
- Frontend Developer — 4d (React components, token management, UI)

## Committed Stories (Assignment Requirements)
| Story | Description | Estimate (pts) | Owner | Dependencies |
|-------|-------------|----------------|-------|--------------|
| AUTH-01 | Email/password login form with validation | 5 | Frontend Dev | Backend auth endpoint |
| AUTH-02 | Google Sign-In OAuth integration | 5 | Full-stack Dev | Google OAuth credentials |
| AUTH-03 | Token management (access in-memory, refresh in localStorage) | 5 | Full-stack Dev | AUTH-01, AUTH-02 |
| AUTH-04 | Automatic token refresh on 401 with concurrency handling | 5 | Full-stack Dev | AUTH-03 |
| AUTH-05 | Protected routes (PrivateRoute component) | 3 | Frontend Dev | AUTH-03 |
| AUTH-06 | Logout functionality | 2 | Frontend Dev | AUTH-03 |
| DASH-01 | Three-column layout (folders, list, detail) | 5 | Frontend Dev | Mock API |
| DASH-02 | Folder sidebar with navigation | 3 | Frontend Dev | DASH-01 |
| DASH-03 | Email list component with pagination/virtualization | 5 | Frontend Dev | Mock API endpoint |
| DASH-04 | Email detail view with actions | 5 | Frontend Dev | DASH-03 |
| DASH-05 | Mock API endpoints (mailboxes, emails) | 3 | Backend Dev | FastAPI setup |
| DASH-06 | Responsive mobile layout | 3 | Frontend Dev | DASH-01 |
| DASH-07 | Keyboard accessibility | 2 | Frontend Dev | DASH-01, DASH-03 |
| DEPLOY-01 | Deploy to public hosting (Netlify/Vercel) | 3 | Full-stack Dev | All features |
| DOCS-01 | README with setup, deployment URL, token justification | 2 | Full-stack Dev | DEPLOY-01 |

## Stretch Goals (Optional)
- Silent token refresh before expiration (proactive refresh)
- Multi-tab logout sync (BroadcastChannel)
- Offline-capable mailbox caching
- Role-based access control UI

## Risks & Mitigation
- **OAuth redirect mismatch** — Test redirect URIs early, verify in Google Console
- **Token refresh race condition** — Implement request queue for concurrent 401s
- **Mock API data quality** — Create realistic sample data with varied content
- **Deployment issues** — Test deployment early in week, not last day

## QA Plan
- Manual testing: Login (email), Login (Google), Token refresh simulation, Logout, Dashboard navigation
- Verify token storage: access token not in localStorage, refresh token in localStorage
- Test protected routes: redirect when unauthenticated, access when authenticated
- Test responsive layout on mobile devices
- Verify keyboard navigation works correctly
- Update `06-qa/ACCEPTANCE_TESTS.md` after execution

## Deliverables Checklist
- [ ] Source code in public Git repository
- [ ] README.md with:
  - [ ] Setup and run instructions
  - [ ] Public hosting URL
  - [ ] Token storage choices and security justification
  - [ ] Third-party services used
  - [ ] Screenshots or GIF walkthrough
- [ ] Working authentication (email/password + Google)
- [ ] Working token refresh mechanism
- [ ] Three-column email dashboard with mock data
- [ ] Protected routes implementation
- [ ] Deployed app accessible publicly

> Review progress daily; adjust scope if needed. Focus on core assignment requirements first.

