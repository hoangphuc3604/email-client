# User Journeys

## Journey 1 — First-time setup (Admin)
1. Admin receives invite, signs in via magic link.
2. Completes onboarding wizard (workspace name, timezone).
3. Connects Google account for inbox sync.
4. Configures SMTP relay credentials.
5. Invites teammates and toggles AI features.

Pain points to avoid:
- Confusing OAuth redirect loops.
- Missing feedback on connector status.

## Journey 2 — Daily triage (Knowledge Worker)
1. Opens inbox, sees new threads with AI summaries.
2. Reads prioritized message, marks others as read.
3. Uses suggested reply for quick response.
4. Archives completed threads.

Pain points to avoid:
- Slow inbox load.
- Unclear AI summary disclaimers.

## Journey 3 — Incident response (Ops)
1. Receives alert that sync is failing.
2. Checks monitoring dashboard.
3. Navigates to admin settings to re-auth connector.
4. Confirms backlog drains.

Pain points to avoid:
- Lack of actionable error messages.
- Limited visibility into sync status.

> Keep journeys updated as features evolve.

