# Local Setup

## Prerequisites
- Python 3.12+
- Node.js 20+ (for Next.js frontend)
- pnpm 8+
- Docker Desktop (for MongoDB, Redis, MinIO)

## Quick start
```bash
# Backend
cd apps/server
python -m venv .venv
source .venv/Scripts/activate # Windows adjust accordingly
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload

# Frontend
cd ../client
pnpm install
pnpm dev
```

## Services
```bash
docker compose -f docker-compose.dev.yaml up mongo redis minio mailhog
```

- Mongo accessible at `mongodb://localhost:27017/emailclient`.
- Redis at `redis://localhost:6379/5`.
- MinIO at `http://localhost:9000`.
- Mailhog UI at `http://localhost:8025`.

## Environment variables
Backend (`.env.local`):
```bash
ENVIRONMENT=development
DB_CONNECTION_STRING=mongodb://localhost:27017
DB_NAME=email_client
JWT_SECRET=your-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_DURATION_MINUTE=15
REFRESH_TOKEN_DURATION_DAY=7
BASE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000,http://localhost:5173
GOOGLE_CLIENT_ID=your-google-client-id
```

Frontend (`.env.local`):
```bash
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

## Tooling
- Lint backend: `ruff check`.
- Format backend: `ruff format`.
- Lint frontend: `pnpm lint`.
- Test backend: `pytest`.
- Test frontend: `pnpm test`.

> Update this doc when adding services or scripts.

