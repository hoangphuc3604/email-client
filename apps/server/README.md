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
│   ├── mail/        # Mail module - Gmail Integration
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
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `FRONTEND_URL`: Comma-separated list of allowed frontend URLs for CORS

## Development

### Running Tests

```bash
pytest
```

### Code Style

Follow PEP 8 and use type hints for all functions.

## API Endpoints

### Authentication
- `GET /api/v1/auth/google/url` - Get Google OAuth2 authorization URL
- `POST /api/v1/auth/register` - Register new user with email and password
- `POST /api/v1/auth/login` - Email/password login
- `POST /api/v1/auth/google` - Google OAuth sign-in
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout

### Mail (Gmail Integration)
- `GET /api/v1/mail/mailboxes` - List mailboxes/labels
- `GET /api/v1/mail/mailboxes/{mailbox_id}/emails` - List emails in mailbox (paginated)
- `GET /api/v1/mail/emails/{email_id}` - Get email detail
- `POST /api/v1/mail/emails/send` - Send a new email
- `POST /api/v1/mail/emails/{email_id}/reply` - Reply to an email
- `POST /api/v1/mail/emails/{email_id}/modify` - Update email properties (read/unread, star, labels)

## Notes

- The mail module integrates directly with Gmail API using the user's OAuth credentials.
- Google OAuth requires proper credentials from Google Cloud Console with Gmail API scopes enabled.

