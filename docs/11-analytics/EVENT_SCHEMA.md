# Event Schema

| Event | Trigger | Properties | Notes |
|-------|---------|------------|-------|
| `auth.login_requested` | User submits magic link form | `email`, `tenant_id`, `method` | Rate limited |
| `auth.login_succeeded` | User completes login | `method`, `tenant_id`, `user_id` | |
| `mail.thread_viewed` | Thread opened | `thread_id`, `mailbox_id`, `unread_before` | |
| `mail.ai_summary_opened` | AI summary expanded | `thread_id`, `provider` | |
| `mail.compose_sent` | Send action completes | `thread_id`, `recipient_count`, `attachments_count` | |
| `settings.connector_connected` | New connector added | `type`, `tenant_id` | |
| `feature.flag_toggled` | Admin changes feature flag | `flag`, `enabled` | Audit log |

## Instrumentation plan
- Frontend uses Segment (or internal analytics service) via centralized hook.
- Backend emits events for API-only flows (e.g., background sync).
- Store analytics configuration per environment in `config/analytics.json`.

> Keep schema synchronized with dashboards and privacy policy.

