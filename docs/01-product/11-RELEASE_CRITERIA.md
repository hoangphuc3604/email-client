# Release Criteria

Before promoting a release to production, ensure:

## Functional
- [ ] All MVP user stories in scope show “Done” with QA sign-off.
- [ ] OpenAPI docs reflect deployed endpoints (versioned tag created).
- [ ] Regression suite passes on staging (auth, inbox, compose).

## Security & Compliance
- [ ] Security review completed; no open High/Critical items.
- [ ] Secrets stored in Vault/Secrets Manager and rotated.
- [ ] Audit logging enabled for auth and message access.

## Performance
- [ ] Load test proves inbox list P95 < 300ms, compose send P95 < 600ms.
- [ ] Sync workers sustain baseline throughput (300 msgs/min).
- [ ] Error rate < 0.5% across API endpoints for 24h on staging.

## Operability
- [ ] Monitoring dashboards and alerts configured.
- [ ] On-call playbook updated in `07-ops/ONCALL_RUNBOOK.md`.
- [ ] Rollback procedure validated (blue/green or canary plan).

## Documentation
- [ ] Release notes drafted (`13-releases/RELEASE_NOTES_TEMPLATE.md`).
- [ ] User-facing guides updated (`10-user/`).
- [ ] Internal docs updated (SRS changelog, ADRs if applicable).

> Gatekeeper: Product Owner + Tech Lead + QA Lead.

