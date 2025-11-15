# Metrics & KPIs

| Metric | Definition | Target | Owner | Notes |
|--------|------------|--------|-------|-------|
| Time to Inbox | Time from account creation to first inbox load | < 5 min | Product | Includes OAuth setup |
| Auth Success Rate | Successful logins / total attempts | > 98% | Backend | Track per method |
| Sync Freshness | Age of newest message vs provider | < 2 min | Backend | Monitor per connector |
| Draft Reliability | Autosave success rate | > 99% | Frontend | Should recover after offline |
| AI Summary Uptake | % threads with summary viewed | > 60% | AI Lead | Goal post MVP |
| Error Budget | Availability SLO 99.9% | ≤ 43 min downtime/mo | DevOps | Across API + frontend |

## Instrumentation plan
- Use OpenTelemetry for tracing FastAPI endpoints and worker jobs.
- Publish metrics to Prometheus via `/metrics`.
- Frontend sends analytics events through Segment (optional fallback to self-hosted).
- Dashboard curated in Grafana (auth, sync, AI adoption).

> Review metrics quarterly and adjust targets post-pilot.

