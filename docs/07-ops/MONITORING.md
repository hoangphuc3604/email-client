# Monitoring & Observability

## Metrics
- API latency (`http_request_duration_seconds` by route).
- Auth success/failure counters.
- Sync worker throughput (messages/min).
- Queue depth (Redis).
- Error budget burn rate.

## Logging
- Structured JSON via `structlog`.
- Ship to Loki/ELK with correlation IDs.
- Mask PII (email addresses) before logging.

## Tracing
- OpenTelemetry instrumentation for FastAPI, Mongo, Redis.
- Export to collector → Jaeger or Tempo.

## Dashboards
- Auth overview (success rate, failures by reason).
- Inbox performance (latency, error rates).
- Sync health (lag, retries).
- Worker resource usage.

## Alerts
- Auth failure spike (>5% in 5 min).
- Sync lag > 5 min for any mailbox.
- Queue depth > threshold for 10 min.
- Mongo replication lag > 30s.

> Align alerts with SLOs defined in `07-ops/ONCALL_RUNBOOK.md`.

