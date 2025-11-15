# Deployment Runbook

## Environments
- **Dev** — Automatic deploy from `develop` (GitHub Actions -> Docker Compose host).
- **Staging** — Manual approval; mirrors production topology.
- **Production** — Manual deploy from tagged release.

## Backend Deployment (FastAPI)
1. Ensure image `ghcr.io/org/email-client-api:<tag>` exists.
2. For staging:
   - Run workflow `deploy-backend.yml` with parameters (env=staging, tag=<tag>).
   - Workflow pulls secrets from Vault (OIDC), runs Prisma-like migrations (custom script `python scripts/migrate.py`).
   - Health check: `GET /healthz` must return 200.
3. For production:
   - Trigger workflow with change window approval.
   - Canary deploy 10% traffic, monitor for 15 minutes.
   - Promote to 100% if metrics nominal.
   - If issue, trigger rollback (redeploy previous tag).

## Frontend Deployment (Next.js)
- Managed by Vercel.
- Ensure environment variables updated.
- Promote staging build to production after backend go-live.

## Configuration management
- `app/config.py` reads `.env` + environment overrides (pattern from `cqtpos-be`).
- Secrets stored in Vault; retrieved during deploy.
- Feature flags managed via Mongo collection; ensure migrations in place.

## Rollback Procedure
- Backend: re-run deployment workflow with previous tag (recorded in release notes).
- Frontend: revert to prior Vercel deployment.
- Restore Mongo from backup if data corruption (Atlas PITR).

## Monitoring post-deploy
- Verify dashboards (auth success, API latency).
- Check logs for new errors.
- QA smoke tests within 1 hour.

> Keep this updated as infrastructure decisions (Fly.io vs ECS) finalize.

