# Token Storage Strategy

## Overview
This application implements a secure token-based authentication system using JWT access tokens and refresh tokens with HttpOnly cookies.

## Token Types

### Access Token
- **Lifetime**: 15 minutes
- **Storage**: In-memory (React state/context) on client
- **Purpose**: Authorize API requests
- **Format**: JWT with payload `{sub: userId, email: userEmail, type: "access", exp: timestamp}`
- **Transmission**: `Authorization: Bearer <token>` header

### Refresh Token
- **Lifetime**: 7 days
- **Storage**: HttpOnly cookie on client, database on server
- **Purpose**: Obtain new access tokens
- **Format**: JWT with payload `{sub: userId, email: userEmail, type: "refresh", exp: timestamp}`
- **Transmission**: Automatically sent as cookie with requests to `/api/v1/auth/*`
- **Rotation**: Each refresh generates NEW refresh token, old token marked revoked
- **Reuse Detection**: Using revoked token triggers security response (revoke all sessions)

## Why HttpOnly Cookies?

### Security Benefits
1. **XSS Protection**: JavaScript cannot read HttpOnly cookies, preventing token theft via XSS attacks
2. **Automatic Transmission**: Browser automatically sends cookies, no manual token management needed
3. **Server-Side Validation**: Refresh tokens validated against database, enabling immediate revocation

### Assignment Context
The assignment suggested storing refresh tokens in `localStorage`, but we chose HttpOnly cookies as a **stretch goal implementation** because:
- It's the industry best practice for production applications
- Provides superior security against XSS attacks
- Demonstrates understanding of modern web security principles
- Assignment explicitly lists "Store refresh token in HttpOnly cookie" as a stretch goal

## Environment-Aware Configuration

### Development (HTTP localhost)
```python
{
    "httponly": True,
    "secure": False,      # Allow HTTP
    "samesite": "lax",    # Allow same-site requests
    "max_age": 604800,    # 7 days
    "path": "/api/v1/auth"
}
```

### Production (HTTPS)
```python
{
    "httponly": True,
    "secure": True,       # HTTPS only
    "samesite": "strict", # Strict same-site policy
    "max_age": 604800,
    "path": "/api/v1/auth"
}
```

### Cross-Origin Development (Local FE + Deployed BE)
```python
{
    "httponly": True,
    "secure": True,
    "samesite": "none",   # Allow cross-origin
    "max_age": 604800,
    "path": "/api/v1/auth"
}
```

## Authentication Flow

### 1. Login/Register
```
Client                          Server
  |                               |
  |-- POST /auth/login ---------->|
  |   {email, password}           |
  |                               |
  |   [Server revokes old tokens] |
  |   [Creates new token pair]    |
  |                               |
  |<-- 200 OK --------------------|
  |   Set-Cookie: refresh_token   |
  |   Body: {access_token, user}  |
  |                               |
```

### 2. Authenticated Request
```
Client                          Server
  |                               |
  |-- GET /api/resource --------->|
  |   Authorization: Bearer <AT>  |
  |   Cookie: refresh_token       |
  |                               |
  |<-- 200 OK --------------------|
  |   {data}                      |
  |                               |
```

### 3. Token Refresh (With Rotation)
```
Client                          Server
  |                               |
  |-- POST /auth/refresh -------->|
  |   Cookie: refresh_token_A     |
  |                               |
  |   [Validate token_A in DB]    |
  |   [Mark token_A as revoked]   |
  |   [Create token_B]            |
  |                               |
  |<-- 200 OK --------------------|
  |   Set-Cookie: refresh_token_B |
  |   Body: {access_token}        |
  |                               |
```

### 3b. Token Reuse Detection (Attack)
```
Attacker                        Server
  |                               |
  |-- POST /auth/refresh -------->|
  |   Cookie: refresh_token_A     |
  |   (Already revoked!)          |
  |                               |
  |   [Find token_A: revoked=true]|
  |   [SECURITY BREACH DETECTED!] |
  |   [Revoke ALL user tokens]    |
  |                               |
  |<-- 401 Unauthorized -----------|
  |   "Token reuse detected"      |
  |                               |
```

### 4. Logout
```
Client                          Server
  |                               |
  |-- POST /auth/logout --------->|
  |   Cookie: refresh_token       |
  |                               |
  |   [Server deletes RT from DB] |
  |                               |
  |<-- 200 OK --------------------|
  |   Set-Cookie: (delete cookie) |
  |                               |
```

## Client Implementation

### Axios Configuration (With Request Deduplication)
```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // CRITICAL: Send cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

apiClient.interceptors.request.use((config) => {
  const accessToken = getAccessToken(); // From React context
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Another request is already refreshing, wait for it
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          });
        });
      }
      
      originalRequest._retry = true;
      isRefreshing = true;
      
      try {
        // Refresh token sent automatically via cookie
        // Server will rotate the refresh token
        const { data } = await apiClient.post('/auth/refresh');
        const newToken = data.data.access_token;
        
        setAccessToken(newToken);
        onRefreshed(newToken);
        
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed (expired or revoked), logout
        logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
    return Promise.reject(error);
  }
);
```

### Silent Token Refresh (Proactive)
```typescript
// Refresh token 2 minutes before expiry
useEffect(() => {
  if (!accessToken) return;

  const payload = JSON.parse(atob(accessToken.split('.')[1]));
  const expiresAt = payload.exp * 1000;
  const timeUntilRefresh = expiresAt - Date.now() - 120000; // 2 min buffer

  if (timeUntilRefresh > 0) {
    const timeout = setTimeout(async () => {
      try {
        const { data } = await apiClient.post('/auth/refresh');
        setAccessToken(data.data.access_token);
      } catch (error) {
        logout();
      }
    }, timeUntilRefresh);

    return () => clearTimeout(timeout);
  }
}, [accessToken]);
```

## Security Considerations

### Threats Mitigated
- ✅ **XSS attacks**: HttpOnly cookie prevents JavaScript access
- ✅ **Token theft detection**: Rotation + reuse detection catches stolen tokens
- ✅ **Token replay**: Revoked tokens cannot be reused
- ✅ **CSRF attacks**: SameSite cookie policy + CORS configuration
- ✅ **Session hijacking**: All sessions revoked when breach detected
- ✅ **Concurrent requests**: Client-side deduplication prevents race conditions

### Token Rotation Policy
- ✅ **Automatic rotation**: Each refresh issues new refresh token
- ✅ **Token reuse detection**: Detects stolen tokens when reused
- ✅ **Security response**: Revokes all sessions if reuse detected
- ✅ **Audit trail**: Tracks token lineage via parent_token_id

### Single Active Session per Login
- ✅ **One token per session**: Each login/register revokes all previous tokens
- ✅ **Automatic cleanup**: Old tokens marked as revoked (not deleted)

### Remaining Considerations
- ⚠️ **CSRF on token refresh**: Mitigated by SameSite policy, consider CSRF tokens for enhanced security
- ⚠️ **Cookie size**: JWT tokens add overhead to every request to `/api/v1/auth/*`
- ⚠️ **Multi-device support**: Current policy logs out other devices on new login
- ⚠️ **Token rotation on refresh**: Future enhancement - issue new refresh token on each use

## Deployment Notes

### Local Development
- Set `ENVIRONMENT=development` in `.env.local`
- Cookies work with HTTP localhost
- No HTTPS certificate needed

### Production Deployment
- Set `ENVIRONMENT=production` in environment variables
- Requires HTTPS for `secure=true` cookies
- Configure `FRONTEND_URL` with deployed frontend origin
- Ensure CORS allows production frontend origin

### Testing with Deployed Backend
```bash
# Backend deployed at https://api.example.com
# Frontend local at http://localhost:3000

# Backend .env
ENVIRONMENT=production
FRONTEND_URL=http://localhost:3000,https://app.example.com

# Cookie will use samesite=none to allow cross-origin
```

## Comparison with Alternatives

| Approach | Security | Complexity | Assignment Fit |
|----------|----------|------------|----------------|
| **localStorage** | ⭐⭐ (XSS vulnerable) | ⭐ (Simple) | Required (baseline) |
| **HttpOnly Cookie** | ⭐⭐⭐⭐⭐ (Best) | ⭐⭐⭐ (Medium) | Stretch goal ✅ |
| **Both in memory** | ⭐⭐⭐ (Logout on refresh) | ⭐ (Simple) | Poor UX |

## References
- [OWASP Token Storage](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html#token-storage-on-client-side)
- [MDN HttpOnly Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#restrict_access_to_cookies)
- [SameSite Cookie Attribute](https://web.dev/samesite-cookies-explained/)
