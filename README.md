# Email Client - React Authentication & Dashboard

A full-stack email client application built with React, TypeScript, and FastAPI featuring secure authentication (email/password + Google OAuth) and a three-column email dashboard with mock email API integration.

## 🚀 Live Demo

**Deployed URL:** [Coming Soon - Will be deployed to Vercel/Netlify]

## ✨ Features

### Authentication
- ✅ Email & Password login with client-side validation
- ✅ Google Sign-In (OAuth 2.0 Authorization Code Flow)
- ✅ JWT-based authentication (access + refresh tokens)
- ✅ Automatic token refresh on 401 responses
- ✅ Protected routes with redirect to login
- ✅ Logout with token cleanup
- ✅ User registration with validation
- ✅ Loading indicators and error messages

### Email Dashboard (3-Column Layout)
- ✅ **Column 1 - Mailboxes**: Inbox (with unread count), Starred, Sent, Drafts, Trash
- ✅ **Column 2 - Email List**: Sender, subject, preview, timestamp, star icon, checkboxes
- ✅ **Column 3 - Email Detail**: Full email content with Reply/Forward/Delete actions
- ✅ Actions: Compose, Refresh, Select All, Delete, Mark Read/Unread, Star/Unstar
- ✅ Keyboard navigation (Arrow keys, Enter)
- ✅ Responsive mobile layout with back button
- ✅ LocalStorage persistence for email state (read/starred status)

### Mock Email API
- ✅ GET `/api/v1/mock-mail/mailboxes` - List mailboxes
- ✅ GET `/api/v1/mock-mail/mailboxes/:id/emails` - List emails in mailbox
- ✅ GET `/api/v1/mock-mail/emails/:id` - Get email detail
- ✅ POST `/api/v1/mock-mail/emails/send` - Send email

## 🛠 Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite
- React Router v6
- React Query (@tanstack/react-query)
- Zustand (state management)
- Axios (HTTP client)
- React Bootstrap
- React Icons

**Backend:**
- FastAPI (Python)
- MongoDB (AsyncMongoClient)
- JWT (access + refresh tokens)
- Google OAuth 2.0
- Pydantic models with CamelCase conversion

## 📦 Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+
- MongoDB (local or MongoDB Atlas)
- Google OAuth credentials (for Google Sign-In)

### 1. Clone the Repository
```bash
git clone https://github.com/hoangphuc3604/email-client.git
cd email-client
```

### 2. Backend Setup

```bash
cd apps/server

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env.local from template
copy .env.template .env.local  # Windows
cp .env.template .env.local    # Mac/Linux

# Edit .env.local with your configuration:
# - DB_CONNECTION_STRING (MongoDB connection string)
# - GOOGLE_CLIENT_ID (from Google Cloud Console)
# - GOOGLE_CLIENT_SECRET (from Google Cloud Console)
# - JWT_SECRET (generate a secure random string)
# - FRONTEND_URL=http://localhost:5173

# Run development server
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd apps/client

# Install dependencies
npm install

# Run development server
npm run dev
```

The app will be available at `http://localhost:5173`

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable **Google+ API**
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URI: `http://localhost:5173/login`
6. Copy Client ID and Client Secret to backend `.env.local`

## 🔒 Token Storage & Security

### Access Token (In-Memory)
- **Storage**: React state (Zustand store) + axios default headers
- **Lifetime**: 15 minutes
- **Reasoning**: Stored in-memory to prevent XSS attacks. Never persisted to localStorage/sessionStorage.

### Refresh Token (LocalStorage)
- **Storage**: `localStorage.getItem('refresh_token')`
- **Lifetime**: 7 days
- **Reasoning**: While HttpOnly cookies would be more secure, we use localStorage for:
  - **Simplicity**: Easier to implement without backend cookie configuration complexity
  - **CORS friendly**: Works with different frontend/backend domains during development
  - **Mobile compatibility**: Works consistently across all browsers/devices
  - **Acceptable risk**: For a learning/demo project, the convenience outweighs the XSS risk
  - **Mitigation**: Tokens cleared on logout, expired tokens force re-authentication

**Production Recommendation**: For production apps, use HttpOnly cookies for refresh tokens with:
- `SameSite=Strict` or `Lax`
- `Secure=true` (HTTPS only)
- CSRF token protection

### Token Refresh Flow
1. API request receives 401 Unauthorized
2. Axios interceptor automatically calls `/auth/refresh` with refresh token
3. New access token received and set in axios headers
4. Original request retried with new token
5. Concurrent requests queued and retried after refresh completes
6. If refresh fails (expired/invalid), force logout and redirect to login

## 🎮 Features in Detail

### Authentication Flow
1. **Email/Password Login**:
   - Client-side validation (email format, required fields)
   - Server validates credentials and returns tokens
   - Access token stored in-memory, refresh token in localStorage
   - Redirect to `/dashboard` on success

2. **Google Sign-In**:
   - Authorization Code Flow (more secure than Implicit Flow)
   - User clicks "Login with Google" → redirects to Google OAuth consent screen
   - Google redirects back to `/login?code=...`
   - Frontend exchanges code with backend for tokens
   - Loading spinner shown during authentication

3. **Protected Routes**:
   - `/dashboard` requires authentication
   - Unauthenticated users redirected to `/login`
   - Loading screen shown during auth initialization

### Dashboard Features
- **Folder Management**: Switch between Inbox, Starred, Sent, Drafts, Trash
- **Email Operations**:
  - Mark as read/unread (persists across sessions)
  - Star/unstar (moves between Inbox and Starred folders)
  - Delete (moves to Trash folder)
  - Compose and send new emails
- **State Persistence**: Email states saved to localStorage and restored on page reload
- **Cache Management**: Email cache cleared on logout for security

### Keyboard Navigation
- **Arrow Down**: Move to next email
- **Arrow Up**: Move to previous email
- **Enter**: Open selected email

### Responsive Design
- **Desktop**: 3-column layout (Folders | List | Detail)
- **Mobile**: Single column with back button to switch between views
- Breakpoint: `md` (768px)

## 📝 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Email/password login
- `GET /api/v1/auth/google/url` - Get Google OAuth URL
- `POST /api/v1/auth/google` - Exchange Google code for tokens
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - Logout and revoke tokens
- `GET /api/v1/auth/me` - Get current user info

### Mock Mail API
- `GET /api/v1/mock-mail/mailboxes` - List mailboxes
- `GET /api/v1/mock-mail/mailboxes/:id/emails` - List emails
- `GET /api/v1/mock-mail/emails/:id` - Get email detail
- `POST /api/v1/mock-mail/emails/send` - Send email
- `POST /api/v1/mock-mail/emails/:id/modify` - Update email properties

## 🧪 Testing

### Test Email/Password Login
- Email: `test@example.com`
- Password: `password123`

### Test Google Login
Use your own Google account (requires Google OAuth credentials configured)

## 📸 Screenshots

[Screenshots will be added after deployment]

### Login Flow
1. Email/Password login with validation
2. Google Sign-In OAuth flow
3. Loading indicator during authentication
4. Error message display for failed login

### Dashboard
1. Three-column layout (Folders | Email List | Email Detail)
2. Email operations (star, delete, mark read)
3. Compose modal
4. Mobile responsive view

## 🚀 Deployment

### Deploy to Vercel (Frontend)
```bash
cd apps/client
vercel --prod
```

### Deploy to Render/Railway (Backend)
1. Connect GitHub repository
2. Set environment variables from `.env.local`
3. Deploy with auto-detect Python buildpack

## 📚 Third-Party Services

- **Google OAuth 2.0**: User authentication via Google account
- **MongoDB Atlas**: Database hosting (or local MongoDB for development)
- **Vercel/Netlify**: Frontend hosting (coming soon)
- **Render/Railway**: Backend API hosting (coming soon)

## 🏗 Project Structure

```
email-client/
├── apps/
│   ├── client/                  # React frontend
│   │   ├── src/
│   │   │   ├── api/            # API clients (auth, mail)
│   │   │   ├── auth/           # Auth initializer
│   │   │   ├── components/     # React components
│   │   │   │   ├── Auth/       # ProtectedRoute
│   │   │   │   ├── Dashboard/  # 3-column email UI
│   │   │   │   ├── Login/      # Login form + Google OAuth
│   │   │   │   └── Signup/     # Registration form
│   │   │   ├── hooks/          # useAuth hooks
│   │   │   └── store/          # Zustand auth store
│   │   └── package.json
│   └── server/                  # FastAPI backend
│       ├── app/
│       │   ├── api/
│       │   │   ├── auth/       # Auth endpoints
│       │   │   └── mail/       # Mock mail endpoints
│       │   ├── models/         # Pydantic models
│       │   ├── utils/          # Helper functions
│       │   ├── config.py       # Settings
│       │   ├── database.py     # MongoDB connection
│       │   └── main.py         # FastAPI app
│       └── requirements.txt
└── docs/                        # Documentation

```

## 🎯 Assignment Requirements Checklist

### Authentication (30%)
- ✅ Email/password login implemented
- ✅ Google Sign-In OAuth implemented
- ✅ Tokens used for protected API calls
- ✅ Client-side form validation
- ✅ Server error handling and display

### Token Refresh & API Handling (20%)
- ✅ Automatic refresh on 401 responses
- ✅ Concurrency handling (queued requests)
- ✅ Failed refresh forces logout

### Mock Email API Integration (15%)
- ✅ Mock API endpoints implemented
- ✅ Realistic sample data with sender, subject, preview, timestamps
- ✅ All CRUD operations working

### Form Handling & Validation (10%)
- ✅ Client-side validation with inline errors
- ✅ Server error display
- ✅ Loading indicators
- ✅ Disabled buttons during submission

### Public Hosting & Deployment (10%)
- ⏳ Coming soon - Will deploy to Vercel + Render

### UI/UX & 3-Column Dashboard (10%)
- ✅ Three-column layout (Folders | List | Detail)
- ✅ All required features (compose, delete, star, etc.)
- ✅ Keyboard navigation
- ✅ Responsive mobile layout

### Error Handling & Code Organization (5%)
- ✅ Graceful token expiry handling
- ✅ Network error handling
- ✅ Modular code structure
- ✅ TypeScript for type safety

## 🔮 Future Enhancements

- [ ] Silent token refresh before expiration
- [ ] HttpOnly cookie for refresh tokens
- [ ] Multi-tab logout sync (BroadcastChannel)
- [ ] Offline-capable mailbox caching
- [ ] Role-based access control
- [ ] Email search functionality
- [ ] Attachment upload/download
- [ ] Rich text email composer
- [ ] Email threading
- [ ] Push notifications

## 📄 License

MIT License - See LICENSE file for details

## 👤 Author

**Hoang Phuc**
- GitHub: [@hoangphuc3604](https://github.com/hoangphuc3604)

## 🙏 Acknowledgments

- Assignment provided by Advanced Web Development course
- React Bootstrap for UI components
- FastAPI for modern Python backend
- MongoDB for flexible document storage
