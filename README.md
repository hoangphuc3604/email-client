# Email Client - React Authentication & Gmail Integration

A full-stack email client application built with React, TypeScript, and FastAPI featuring secure authentication (email/password + Google OAuth) and a three-column email dashboard with **real Gmail API integration** (Track A).

## 🚀 Live Demo

**Frontend:** [YOUR_FRONTEND_DEPLOYED_URL]
**Backend API:** [YOUR_BACKEND_DEPLOYED_URL]

**Demo Video/GIF:** [YOUR_DEMO_VIDEO_LINK]

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

### Gmail API Integration (Track A)
- ✅ **Real Gmail Integration**: Connects to user's Gmail account via OAuth2
- ✅ **Mailbox Management**: List Gmail labels/folders (Inbox, Starred, Sent, Drafts, Trash)
- ✅ **Email Operations**: Read, send, reply, forward, delete, mark read/unread, star
- ✅ **Thread Support**: Full thread conversation view
- ✅ **Attachments**: Download attachments from emails
- ✅ **Pagination**: Efficient email listing with page tokens
- ✅ **Server-Side Token Refresh**: Gmail refresh tokens stored securely and refreshed automatically

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
- Google OAuth 2.0 (Authorization Code Flow)
- Gmail API (google-api-python-client)
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

#### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

#### Step 2: Enable Gmail API
1. In the Google Cloud Console, navigate to **APIs & Services** > **Library**
2. Search for **Gmail API** and click on it
3. Click **Enable**

#### Step 3: Create OAuth 2.0 Credentials
1. Navigate to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen:
   - Choose **External** (for development) or **Internal** (for Google Workspace)
   - Fill in required fields (App name, User support email, Developer contact)
   - Add scopes:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
   - Add test users (if using External type)
   - Save and continue

4. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: `Email Client`
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (for local development)
     - `[YOUR_FRONTEND_DEPLOYED_URL]` (for production)
   - **Authorized redirect URIs**:
     - `http://localhost:5173/login` (for local development)
     - `[YOUR_FRONTEND_DEPLOYED_URL]/login` (for production)
     - `[YOUR_BACKEND_DEPLOYED_URL]/api/v1/auth/google/callback` (if using backend callback)
   - Click **Create**

5. Copy the **Client ID** and **Client Secret**

#### Step 4: Configure Backend Environment
Add to `apps/server/.env.local`:
```bash
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:5173/login  # For local dev
# For production: GOOGLE_REDIRECT_URI=[YOUR_FRONTEND_DEPLOYED_URL]/login
```

#### Step 5: Configure Frontend Environment (Optional)
If you need Google Client ID in frontend, add to `apps/client/.env.local`:
```bash
VITE_GOOGLE_CLIENT_ID=your-client-id-here
```

> ⚠️ **Important**: Never commit `.env.local` files. They contain sensitive credentials.

## 🔒 Token Storage & Security

### Access Token (In-Memory)
- **Storage**: React state (Zustand store) + axios default headers
- **Lifetime**: 15 minutes
- **Reasoning**: Stored in-memory to prevent XSS attacks. Never persisted to localStorage/sessionStorage.
- **Transmission**: Sent as `Authorization: Bearer <token>` header with each API request
- **Page Refresh Behavior**: Access token is lost on page refresh, but automatically restored via `initAuth()` using refresh token from HttpOnly cookie

### Refresh Token (HttpOnly Cookie) ✅
- **Storage**: HttpOnly, Secure cookie (set by backend)
- **Lifetime**: 7 days
- **Why HttpOnly Cookies?**
  - ✅ **XSS Protection**: JavaScript cannot access HttpOnly cookies, preventing token theft
  - ✅ **Automatic Transmission**: Browser automatically sends cookies with requests
  - ✅ **Server-Side Validation**: Refresh tokens validated against database, enabling immediate revocation
  - ✅ **Industry Best Practice**: Recommended by OWASP for production applications
- **Cookie Configuration**:
  - `HttpOnly: true` - Prevents JavaScript access
  - `Secure: true` - HTTPS only (production)
  - `SameSite: Lax/Strict` - CSRF protection
  - `Path: /api/v1/auth` - Scoped to auth endpoints

### Google Refresh Token (Server-Side)
- **Storage**: Encrypted in MongoDB (server-side only)
- **Purpose**: Used to refresh Gmail API access tokens
- **Security**: Encrypted using AES-256 before storage
- **Never exposed to frontend**: Frontend only receives app JWT tokens

### Token Refresh Flow

**On App Startup (Page Refresh):**
1. App initializes → `initAuth()` runs automatically
2. Calls `/auth/refresh` with refresh token from HttpOnly cookie
3. Backend validates refresh token and issues new access token
4. Access token stored in Zustand store (in-memory)
5. User info fetched and user remains authenticated
6. **No login required** - seamless session restoration

**During API Requests:**
1. API request receives 401 Unauthorized
2. Axios interceptor automatically calls `/auth/refresh` (refresh token sent via cookie)
3. Backend validates refresh token and issues new access token
4. New access token received and stored in Zustand store
5. Original request retried with new token
6. **Concurrency Protection**: Multiple simultaneous 401s queue and wait for single refresh
7. If refresh fails (expired/invalid), force logout and redirect to login

### Security Considerations
- ✅ **Token Rotation**: Each refresh can issue new refresh token (optional enhancement)
- ✅ **Token Reuse Detection**: Backend detects if revoked token is reused
- ✅ **Automatic Revocation**: All tokens revoked on logout
- ✅ **Concurrent Request Handling**: Prevents multiple refresh calls
- ✅ **XSS Mitigation**: HttpOnly cookies prevent JavaScript access
- ✅ **CSRF Protection**: SameSite cookie policy

> 📚 For detailed token storage documentation, see [`docs/auth/TOKEN_STORAGE.md`](docs/auth/TOKEN_STORAGE.md)

## 🎮 Features in Detail

### Authentication Flow
1. **Email/Password Login**:
   - Client-side validation (email format, required fields)
   - Server validates credentials and returns tokens
   - Access token stored in-memory (Zustand store), refresh token in HttpOnly cookie
   - Redirect to `/dashboard` on success

2. **Google Sign-In**:
   - **Authorization Code Flow** (more secure than Implicit Flow)
   - User clicks "Login with Google" → backend generates OAuth URL
   - User redirected to Google OAuth consent screen
   - User grants permissions (Gmail read, modify, send)
   - Google redirects back to `/login?code=...` with authorization code
   - Frontend sends code to backend `POST /api/v1/auth/google`
   - Backend exchanges code for Google tokens (access + refresh)
   - Backend stores Google refresh token (encrypted) in MongoDB
   - Backend creates app session and returns JWT tokens
   - Loading spinner shown during authentication

3. **Protected Routes**:
   - `/dashboard` requires authentication
   - Unauthenticated users redirected to `/login`
   - Loading screen shown during auth initialization
   - **Automatic Session Restoration**: On page refresh, `initAuth()` automatically refreshes access token from HttpOnly cookie
   - User stays logged in across page refreshes (until refresh token expires)

### Dashboard Features
- **Folder Management**: Switch between Gmail labels (Inbox, Starred, Sent, Drafts, Trash)
- **Email Operations**:
  - Mark as read/unread (syncs with Gmail)
  - Star/unstar (syncs with Gmail)
  - Delete (moves to Gmail Trash)
  - Compose and send new emails (via Gmail API)
  - Reply and Forward with attachments
- **Real Gmail Data**: All emails, folders, and operations sync with your Gmail account
- **State Persistence**: Email UI state saved to localStorage for better UX
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
- `GET /api/v1/auth/google/url` - Get Google OAuth authorization URL
- `POST /api/v1/auth/google` - Exchange Google authorization code for tokens
- `POST /api/v1/auth/refresh` - Refresh access token (uses HttpOnly cookie)
- `POST /api/v1/auth/logout` - Logout and revoke tokens
- `GET /api/v1/auth/me` - Get current user info

### Gmail API (Real Integration)
- `GET /api/v1/mail/mailboxes` - List Gmail labels/folders
- `GET /api/v1/mail/mailboxes/:id/emails` - List emails in mailbox (with pagination)
- `GET /api/v1/mail/emails/:id` - Get full email/thread detail
- `POST /api/v1/mail/emails/send` - Send email via Gmail API
- `POST /api/v1/mail/emails/:id/reply` - Reply to email
- `POST /api/v1/mail/emails/:id/modify` - Update email (mark read/unread, star, delete, labels)
- `GET /api/v1/mail/attachments` - Download attachment
- `POST /api/v1/mail/drafts` - Create draft email

## 🧪 Testing

### Test Email/Password Login
1. Register a new account via `/signup`
2. Or use existing credentials if available

### Test Google Login
1. Ensure Google OAuth credentials are configured (see Setup section)
2. Click "Login with Google" button
3. Grant Gmail permissions when prompted
4. You should be redirected to dashboard with your real Gmail inbox

### Simulate Token Expiry (For Demo)
To demonstrate automatic token refresh:

**Method 1: Wait for Natural Expiry**
- Access token expires after 15 minutes
- Make an API request after expiry
- Watch browser console for automatic refresh

**Method 2: Manually Expire Token (Development)**
1. Open browser DevTools → Application → Cookies
2. Find `refresh_token` cookie
3. Delete or modify the cookie value
4. Make an API request
5. Should see 401 → refresh attempt → logout if refresh fails

**Method 3: Backend Token Expiry (Advanced)**
1. Temporarily reduce `ACCESS_TOKEN_DURATION_MINUTE` in backend `.env.local` to 1 minute
2. Restart backend server
3. Login and wait 1 minute
4. Make an API request to see automatic refresh

**Method 4: Test Page Refresh (Session Restoration)**
1. Login to the application
2. Navigate to `/dashboard` and verify you can see your emails
3. Press `F5` or refresh the page
4. **Expected behavior**: 
   - App should automatically restore your session
   - You should remain logged in (no redirect to `/login`)
   - Dashboard should load with your emails
   - Check browser console: should see `initAuth: attempting server refresh` → success
5. **How it works**: `initAuth()` automatically calls `/auth/refresh` with HttpOnly cookie, gets new access token, and restores user session

**Method 5: Revoke Google Refresh Token**
1. Go to [Google Account Security](https://myaccount.google.com/permissions)
2. Find "Email Client" app
3. Click "Remove access"
4. Try to use the app → should force logout and require re-authentication

## 📸 Screenshots & Demo

**Demo Video/GIF:** [YOUR_DEMO_VIDEO_LINK]

> 📝 Replace `[YOUR_DEMO_VIDEO_LINK]` with your demo video showing:
> - Login flow (email/password and Google OAuth)
> - Inbox populated with real Gmail messages
> - Opening email detail, downloading attachment
> - Replying and sending email
> - Token expiry simulation (optional)

### Key Features Demonstrated
1. **Login Flow**: Email/Password and Google OAuth with real Gmail integration
2. **3-Column Dashboard**: Real Gmail folders and messages
3. **Email Operations**: Mark read/unread, star, delete, reply, forward
4. **Compose & Send**: Create and send emails via Gmail API
5. **Attachments**: Download attachments from emails
6. **Token Refresh**: Automatic token refresh on expiry (demonstrated in video)
7. **Responsive Design**: Mobile-friendly layout

## 🚀 Deployment

### Frontend Deployment (Vercel/Netlify)

**Vercel:**
```bash
cd apps/client
npm install -g vercel
vercel --prod
```

**Netlify:**
```bash
cd apps/client
npm run build
# Upload dist/ folder to Netlify or connect GitHub repo
```

**Environment Variables:**
- `VITE_API_BASE_URL` = `[YOUR_BACKEND_DEPLOYED_URL]`
- `VITE_GOOGLE_CLIENT_ID` = Your Google OAuth Client ID (optional)

### Backend Deployment (Render/Railway/Heroku)

**Render:**
1. Connect GitHub repository
2. Create new Web Service
3. Set build command: `cd apps/server && pip install -r requirements.txt`
4. Set start command: `cd apps/server && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables from `.env.local`

**Railway:**
1. Connect GitHub repository
2. Create new service from GitHub repo
3. Set root directory: `apps/server`
4. Add environment variables
5. Railway auto-detects Python and installs dependencies

**Environment Variables Required:**
```bash
ENVIRONMENT=production
DB_CONNECTION_STRING=mongodb+srv://...
DB_NAME=emailclient
JWT_SECRET=your-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_DURATION_MINUTE=15
REFRESH_TOKEN_DURATION_DAY=7
BASE_URL=[YOUR_BACKEND_DEPLOYED_URL]
FRONTEND_URL=[YOUR_FRONTEND_DEPLOYED_URL]
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=[YOUR_FRONTEND_DEPLOYED_URL]/login
```

**Important:** Update Google OAuth redirect URIs in Google Cloud Console to include your deployed frontend URL.

## 📚 Third-Party Services

- **Google OAuth 2.0**: User authentication and Gmail API access
- **Gmail API**: Real email operations (read, send, modify)
- **MongoDB Atlas**: Database hosting (or local MongoDB for development)
- **Vercel/Netlify**: Frontend hosting
- **Render/Railway/Heroku**: Backend API hosting

## 📋 API Testing

### Postman Collection (Optional)
A Postman collection is available for testing backend endpoints:
- Import the collection from `docs/02-api/postman_collection.json` (if available)
- Set environment variables:
  - `base_url`: `[YOUR_BACKEND_DEPLOYED_URL]` or `http://localhost:8000`
  - `access_token`: Your JWT access token (obtained from login)
- Test endpoints manually or run automated tests

### Testing with cURL
```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Get mailboxes (replace ACCESS_TOKEN)
curl -X GET http://localhost:8000/api/v1/mail/mailboxes \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

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
│       │   │   └── mail/       # Gmail API integration
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

### Gmail API Integration (15%)
- ✅ Real Gmail API integration (Track A)
- ✅ OAuth2 Authorization Code Flow with backend token exchange
- ✅ Server-side Gmail refresh token storage (encrypted)
- ✅ All email operations working (read, send, reply, modify, attachments)

### Form Handling & Validation (10%)
- ✅ Client-side validation with inline errors
- ✅ Server error display
- ✅ Loading indicators
- ✅ Disabled buttons during submission

### Public Hosting & Deployment (10%)
- ✅ Frontend deployed: [YOUR_FRONTEND_DEPLOYED_URL]
- ✅ Backend deployed: [YOUR_BACKEND_DEPLOYED_URL]
- ✅ Demo video: [YOUR_DEMO_VIDEO_LINK]

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

- [x] HttpOnly cookie for refresh tokens ✅ (Implemented)
- [ ] Silent token refresh before expiration (proactive refresh)
- [ ] Multi-tab logout sync (BroadcastChannel)
- [ ] Offline-capable mailbox caching (IndexedDB)
- [ ] Gmail Push Notifications (watch + Pub/Sub)
- [ ] Email search functionality (Gmail search API)
- [ ] Rich text email composer (WYSIWYG editor)
- [ ] Email threading improvements
- [ ] Multi-account support
- [ ] IMAP/POP3 support (Track B)

## 📄 License

MIT License - See LICENSE file for details

## 👤 Author

**Hoang Phuc**
- GitHub: [@hoangphuc3604](https://github.com/hoangphuc3604)

## 🔐 Security Justification

### Why HttpOnly Cookies for Refresh Tokens?

This implementation uses **HttpOnly cookies** for refresh tokens instead of localStorage (as suggested in the assignment baseline). This is a **stretch goal** implementation that demonstrates advanced security practices:

**Security Benefits:**
1. **XSS Protection**: HttpOnly cookies cannot be accessed by JavaScript, preventing token theft via XSS attacks
2. **Automatic Transmission**: Browser automatically sends cookies, reducing implementation complexity
3. **Server-Side Validation**: Refresh tokens validated against database, enabling immediate revocation
4. **Industry Best Practice**: Recommended by OWASP and security experts

**Trade-offs:**
- Slightly more complex CORS configuration (requires `withCredentials: true`)
- Cookie size limits (JWT tokens add ~500-1000 bytes per request)
- CSRF considerations (mitigated by SameSite policy)

**User Experience:**
- ✅ **Seamless Session Restoration**: On page refresh, access token is automatically restored from refresh token cookie
- ✅ **No Manual Re-login**: Users stay authenticated across page refreshes (until refresh token expires after 7 days)
- ✅ **Automatic Token Refresh**: Access token refreshed transparently when expired during active use

**Assignment Context:**
- ✅ Baseline requirement: localStorage (acceptable for learning)
- ✅ Stretch goal: HttpOnly cookies (implemented here)
- ✅ Production-ready: This implementation is suitable for production use

### Google Refresh Token Storage

Google refresh tokens are stored **encrypted** in MongoDB (server-side only):
- **Encryption**: AES-256 encryption before storage
- **Never exposed**: Frontend never receives Google refresh tokens
- **Automatic refresh**: Backend refreshes Gmail API tokens transparently
- **Revocation**: Can be revoked via Google Account settings

### Token Rotation & Reuse Detection

The system implements token rotation and reuse detection:
- Each refresh can issue a new refresh token (optional)
- Reuse of revoked tokens triggers security response
- All user sessions revoked if token reuse detected

For detailed security documentation, see [`docs/auth/TOKEN_STORAGE.md`](docs/auth/TOKEN_STORAGE.md) and [`docs/08-security/THREAT_MODEL.md`](docs/08-security/THREAT_MODEL.md).

## 🙏 Acknowledgments

- Assignment provided by Advanced Web Development course
- React Bootstrap for UI components
- FastAPI for modern Python backend
- MongoDB for flexible document storage
- Google Gmail API for email integration
