# Email Client Backend API

FastAPI backend for Email Client application with authentication and mock email endpoints.

## Setup

1. Create virtual environment:
```bash
python -m venv .venv
```

2. Activate virtual environment:
```bash
# Windows
.venv\Scripts\activate

# Linux/Mac
source .venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `.env.local` from `.env.template` and fill in values:
```bash
# Windows
copy .env.template .env.local

# Linux/Mac
cp .env.template .env.local
```

5. Run development server:
```bash
fastapi dev app/main.py
```

Or with uvicorn:
```bash
uvicorn app.main:app --reload --port 8000
```

6. Access API docs at: http://localhost:8000/docs

## Project Structure

```
app/
├── api/
│   ├── auth/        # Authentication module (register, login, Google OAuth, refresh)
│   ├── mail/        # Mail module - Mock API (to be implemented)
│   └── router.py    # Main router
├── models/          # Global models
│   └── api_response.py
├── utils/           # Utility functions
├── config.py        # Configuration
├── database.py      # Database connection
└── main.py          # FastAPI app entry point
```

## Configuration

All configuration is done via environment variables in `.env.local`. See `.env.template` for required variables.

### Required Environment Variables

- `ENVIRONMENT`: Environment name (LOCAL, DEV, PROD)
- `DB_CONNECTION_STRING`: MongoDB connection string
- `DB_NAME`: Database name
- `JWT_SECRET`: Secret key for JWT tokens
- `ALGORITHM`: JWT algorithm (HS256)
- `ACCESS_TOKEN_DURATION_MINUTE`: Access token expiry in minutes
- `REFRESH_TOKEN_DURATION_DAY`: Refresh token expiry in days
- `BASE_URL`: Base URL of the application
- `GOOGLE_CLIENT_ID`: Google OAuth client ID (optional)
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret (optional)

## Development

### Running Tests

```bash
pytest
```

### Code Style

Follow PEP 8 and use type hints for all functions.

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user with email and password
- `POST /api/v1/auth/login` - Email/password login
- `POST /api/v1/auth/google` - Google OAuth sign-in
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/me` - Get current user (to be implemented)
- `POST /api/v1/auth/logout` - Logout (to be implemented)

### Mail - Mock API (To be implemented)
- `GET /api/v1/mailboxes` - List mailboxes
- `GET /api/v1/mailboxes/{mailbox_id}/emails` - List emails in mailbox
- `GET /api/v1/mailboxes/emails/{email_id}` - Get email detail

## Notes

- The authentication and mail modules are to be implemented separately
- Mock email API will return simulated data for development
- Google OAuth requires proper credentials from Google Cloud Console

