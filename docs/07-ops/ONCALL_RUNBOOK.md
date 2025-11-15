# On-call Runbook

## Contacts
- Primary: Backend Lead (+84 xxx)
- Secondary: DevOps Lead (+84 yyy)
- Escalation: Product Owner, Security Officer

## Tooling access
- Grafana (metrics), Loki (logs), Sentry (errors), PagerDuty (alerts).
- Mongo Atlas console, Redis management console.

## Incident triage
1. Acknowledge alert in PagerDuty.
2. Review dashboards (metrics, traces) to identify scope.
3. Check recent deployments/releases (see `13-releases`).
4. If user-impacting, post status update in #ops-incident channel.

## Common scenarios
- **Auth failures spike**
  - Check FastAPI logs for OAuth errors.
  - Verify Google API status.
  - Roll back auth deployment if regression.
- **Sync backlog**
  - Inspect worker logs.
  - Validate access tokens for connector.
  - Increase worker pods.
- **Queue overload**
  - Clear stuck jobs after capturing evidence.
  - Scale worker pool.

## Rollback
- Follow `05-infra/DEPLOYMENT_RUNBOOK.md`.
- Document root cause and actions within 24 hours.

## Post-incident
- File retro doc in `MEETINGS/`.
- Update runbook/alerts if gaps found.

> Keep emergency contacts and playbooks current.

