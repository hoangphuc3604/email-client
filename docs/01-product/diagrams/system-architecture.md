# System Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        WebApp[Email Client Frontend<br/>Next.js / React / Tailwind]
    end

    subgraph "Edge"
        CDN[CDN / Vercel Edge<br/>Static assets]
    end

    subgraph "API Gateway"
        APIGW[FastAPI Gateway<br/>Rate limiting, auth]
    end

    subgraph "Application Layer"
        AuthSvc[Auth Service<br/>Magic link, OAuth]
        MailSvc[Mail Service<br/>Mailbox, threads, compose]
        SyncWorker[Sync Worker<br/>Background IMAP/REST sync]
        AgentSvc[AI Agent Service<br/>Summaries, suggestions]
        SettingsSvc[Settings Service<br/>Connectors, feature flags]
    end

    subgraph "Data Layer"
        Mongo[(MongoDB Replica Set<br/>Tenants, users, mail, drafts)]
        Redis[(Redis<br/>Sessions, rate limits, queues)]
        Storage[(S3/MinIO<br/>Attachments, exports)]
    end

    subgraph "External Services"
        GmailAPI[Google Gmail API]
        SMTPRelay[SMTP Relay (Mailgun/Postmark)]
        AIProvider[AI Provider<br/>OpenAI/Anthropic/local]
    end

    subgraph "Observability"
        Logs[ELK / Loki<br/>Structured logs]
        Metrics[Prometheus/Grafana]
        Traces[OpenTelemetry Collector]
    end

    WebApp -->|HTTPS| CDN --> APIGW

    APIGW --> AuthSvc
    APIGW --> MailSvc
    APIGW --> SettingsSvc

    AuthSvc --> Mongo
    AuthSvc --> Redis

    MailSvc --> Mongo
    MailSvc --> Redis
    MailSvc --> Storage
    MailSvc --> SMTPRelay

    SyncWorker --> Mongo
    SyncWorker --> Redis
    SyncWorker --> GmailAPI

    AgentSvc --> Mongo
    AgentSvc --> AIProvider

    APIGW --> Logs
    APIGW --> Metrics
    APIGW --> Traces
    SyncWorker --> Logs
    SyncWorker --> Metrics

    style WebApp fill:#f0fff4
    style Mongo fill:#ffe1e1
    style Redis fill:#ffe1f5
    style Storage fill:#f5e1ff
```

## Technology stack (MVP)
- **Frontend:** Next.js 14, React, TailwindCSS, Zustand (state), TanStack Query.
- **Backend:** FastAPI (Python 3.12), Pydantic v2, SQLModel optional (for typed models), Celery/RQ workers.
- **Database:** MongoDB 7 (Replica Set) with GridFS for attachments.
- **Cache/Queue:** Redis 7 (sessions, throttling, task queue).
- **Storage:** MinIO (dev) / AWS S3 (prod) for attachments, exports.
- **Auth:** Authlib (OAuth), custom JWT tokens, magic links.
- **Observability:** OpenTelemetry, Prometheus, Grafana, Loki (TBD).
- **CI/CD:** GitHub Actions, Docker Compose (dev/staging), Terraform (future).

## Data flow examples
- **Magic link login:** WebApp → APIGW → AuthSvc → Redis (rate limit) → SMTP Relay (send) → User clicks link → AuthSvc issues tokens → Mongo session stored.
- **Inbox sync:** SyncWorker (scheduled) → Gmail API → Normalize → Mongo (store threads/messages) → Redis publish → WebApp refetch.
- **Compose send:** WebApp → MailSvc → Mongo (draft) → Storage (attachments) → SMTP Relay (send) → Mongo (update thread) → WebSocket notify WebApp.

> Related docs: `03-architecture/ARCHITECTURE.md`, `02-api/openapi.yaml`, ADR-0001.

