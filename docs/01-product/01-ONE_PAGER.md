# Email Client — One Pager

## Problem
- Teams need a modern, privacy-first email client with AI capabilities that can be self-hosted and customized.
- Organizations require email solutions that integrate seamlessly with their existing Python-based infrastructure and MongoDB data stores.
- Users want a clean, intuitive email experience with support for multiple providers and advanced features.

## Solution
Build a modern email client application that:
- Provides a polished frontend experience using Next.js, React, TailwindCSS, and Shadcn UI.
- Delivers a robust backend with FastAPI, MongoDB, and Redis for performance and scalability.
- Supports AI-assisted workflows (agents, smart triage) via pluggable providers.
- Aligns with modern security and deployment patterns.

## Target users
- Knowledge workers who need efficient email management with AI assistance.
- Organizations requiring self-hosted email solutions with data residency control.
- Teams wanting a customizable email client that integrates with their tech stack.

## Key value props
- **Python-native backend** integrates seamlessly with existing observability & ops tooling.
- **MongoDB data model** aligns perfectly with document-centric email payloads.
- **Configurable connectors** support Gmail, IMAP, and other email providers.
- **Extensible agent framework** enables custom AI intelligence workflows.

## MVP scope (This Week — Assignment Sprint)
- **Authentication**: Email/password login + Google Sign-In OAuth
- **Token Management**: Access token (in-memory) + refresh token (localStorage) with automatic refresh
- **Protected Routes**: PrivateRoute component redirecting unauthenticated users
- **Email Dashboard Mockup**: Three-column layout (folders, email list, email detail) consuming mock API
- **Mock API**: Static JSON or mock server providing realistic email data
- **Deployment**: Public hosting (Netlify/Vercel) with accessible URL

## Future scope (Post-MVP)
- Tenant-aware authentication (passwordless links).
- Mailbox list & thread preview (read-only, synced from upstream provider).
- Basic compose & send (via SMTP relay).
- AI summarization stub using local provider hook.
- Admin settings panel for connectors and feature flags.

## Metrics (Assignment Week)
- Authentication success rate (email/password + Google OAuth): > 95%.
- Token refresh success rate: > 99%.
- Dashboard load time (mock data): < 2 seconds.
- Public deployment accessible and functional.

## Future Metrics
- Time-to-first-inbox (sign-up to first email list): < 5 minutes.
- Auth success rate (passwordless & OAuth): > 98%.
- Deployment time (infrastructure-as-code): < 30 minutes for new tenant.

## Risks & mitigations
- **Risk**: API contract changes may break frontend-backend integration.  
  **Mitigation**: Maintain clear API contracts documented in `02-api/openapi.yaml`.
- **Risk**: MongoDB performance under heavy label operations.  
  **Mitigation**: Use compound indexes, evaluate Redis caching policies early.
- **Risk**: OAuth flows across FastAPI backend & frontend deployment.  
  **Mitigation**: Detailed auth ADR, shared state via signed tokens.

> Updated: 2025-11-13

