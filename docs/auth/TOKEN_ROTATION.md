# Token Rotation & Reuse Detection

## Overview
This implementation uses **refresh token rotation** with **automatic reuse detection** to provide enhanced security against token theft.

## How It Works

### Database Schema
```javascript
{
  _id: ObjectId("..."),
  user_id: ObjectId("user123"),
  token: "eyJhbGc...",           // JWT refresh token
  created_at: ISODate("2025-11-14T10:00:00Z"),
  expires_at: ISODate("2025-11-21T10:00:00Z"),
  revoked: false,                // Initially false, set to true when rotated
  revoked_at: ISODate | null,    // Timestamp when revoked
  parent_token_id: ObjectId | null  // Links to previous token in chain
}
```

### Normal Flow (No Attack)

```
User logs in:
  → Token_1 created (revoked=false)

User refreshes (after 14 mins):
  → Token_1 found, validated
  → Token_1 marked: revoked=true, revoked_at=now
  → Token_2 created (revoked=false, parent_token_id=Token_1._id)
  → Return: access_token + Token_2

User refreshes again:
  → Token_2 found, validated
  → Token_2 marked: revoked=true
  → Token_3 created (revoked=false, parent_token_id=Token_2._id)
  → Return: access_token + Token_3
```

### Attack Detection Flow

```
Attacker steals Token_1 from network:

Legitimate user refreshes first:
  → Token_1 → Token_2 ✓

Attacker tries to use Token_1:
  → Find Token_1: revoked=true ⚠️
  → Reuse detected!
  → Revoke ALL tokens for user_id
  → Return 401: "Token reuse detected - all sessions revoked"
  → User must re-login

Result: Attack detected, all sessions secured!
```

## Race Condition Handling

### Problem
Two browser tabs refresh at same time with Token_A:
```
Tab1: POST /refresh with Token_A (t=0ms)
Tab2: POST /refresh with Token_A (t=50ms)

Without protection:
Tab1: Token_A → Token_B ✓
Tab2: Token_A (now revoked) → THINKS IT'S ATTACK! ❌
```

### Solution: Client-Side Request Deduplication

```typescript
// Frontend handles this
let isRefreshing = false;
let refreshSubscribers = [];

if (isRefreshing) {
  // Queue this request, wait for ongoing refresh
  return new Promise((resolve) => {
    refreshSubscribers.push((token) => {
      resolve(retryWithNewToken(token));
    });
  });
}

isRefreshing = true;
// Perform single refresh
// Notify all queued requests
```

**Result:** Only ONE refresh request sent, all tabs get same new token.

## Security Properties

### 1. Token Theft Detection
```
Scenario: Attacker steals Token_A via XSS/network sniffing

Timeline:
T1: User has Token_A
T2: Attacker steals Token_A
T3: User refreshes → Token_A revoked, gets Token_B
T4: Attacker uses Token_A → DETECTED! → All sessions revoked

Protection: Attacker locked out, user forced to re-authenticate
```

### 2. Replay Attack Prevention
```
Scenario: Attacker records refresh request, tries to replay

Attack: POST /refresh with old Token_A
Result: Token_A already revoked → Reuse detected → 401
Protection: Old tokens cannot be replayed
```

### 3. Session Hijacking Response
```
Scenario: Multiple reuse detections indicate active attack

Detection: 3+ reuse attempts in 1 minute
Action: 
  - Revoke all sessions
  - Flag account for review
  - Notify user via email
  - Require password reset
```

## Implementation Details

### Backend: Token Rotation Logic

```python
async def refresh_access_token(self, refresh_token: str) -> dict:
    # 1. Verify JWT signature
    payload = verify_token(refresh_token, token_type="refresh")
    
    # 2. Find token in database
    token_doc = await self.refresh_tokens_collection.find_one({
        "token": refresh_token
    })
    
    # 3. CHECK FOR REUSE
    if token_doc.get("revoked") == True:
        # Token already used! This is an attack!
        user_id = token_doc["user_id"]
        await self._revoke_all_user_tokens(user_id)
        raise ValueError("Token reuse detected - all sessions revoked")
    
    # 4. Check expiry
    if token_doc["expires_at"] < datetime.utcnow():
        # Expired naturally, not an attack
        await self.refresh_tokens_collection.update_one(
            {"_id": token_doc["_id"]},
            {"$set": {"revoked": True, "revoked_at": datetime.utcnow()}}
        )
        raise ValueError("Refresh token expired")
    
    # 5. Revoke old token (normal rotation)
    await self.refresh_tokens_collection.update_one(
        {"_id": token_doc["_id"]},
        {"$set": {"revoked": True, "revoked_at": datetime.utcnow()}}
    )
    
    # 6. Create new token
    new_refresh_token = create_refresh_token(payload)
    await self.refresh_tokens_collection.insert_one({
        "user_id": token_doc["user_id"],
        "token": new_refresh_token,
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(days=7),
        "revoked": False,
        "parent_token_id": token_doc["_id"]  # Audit trail
    })
    
    # 7. Return both tokens
    new_access_token = create_access_token(payload)
    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "expires_in": 900
    }
```

### Frontend: Request Deduplication

```typescript
// api/client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
  withCredentials: true, // Send HttpOnly cookies
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

// Request interceptor: Add access token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: Handle 401 with deduplication
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Another request is already refreshing
        // Queue this request to retry with new token
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
        // Single refresh request
        // Refresh token sent automatically in HttpOnly cookie
        const { data } = await apiClient.post('/auth/refresh');
        const newToken = data.data.access_token;
        
        // Update stored token
        localStorage.setItem('access_token', newToken);
        
        // Notify all queued requests
        onRefreshed(newToken);
        
        // Retry original request
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed (token revoked/expired), logout
        localStorage.removeItem('access_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
```

## Monitoring & Alerts

### Database Queries for Security Monitoring

```javascript
// Count reuse detections in last hour
db.refresh_tokens.aggregate([
  {
    $match: {
      revoked: true,
      revoked_at: { $gte: new Date(Date.now() - 3600000) }
    }
  },
  {
    $group: {
      _id: "$user_id",
      reuse_count: { $sum: 1 }
    }
  },
  {
    $match: { reuse_count: { $gt: 3 } }
  }
])

// Find users with multiple active tokens (should not happen)
db.refresh_tokens.aggregate([
  {
    $match: { revoked: false }
  },
  {
    $group: {
      _id: "$user_id",
      token_count: { $sum: 1 }
    }
  },
  {
    $match: { token_count: { $gt: 1 } }
  }
])
```

### Cleanup Job (Recommended)

```python
# Scheduled job: Delete old revoked tokens
async def cleanup_old_tokens():
    cutoff_date = datetime.utcnow() - timedelta(days=30)
    
    result = await refresh_tokens_collection.delete_many({
        "revoked": True,
        "revoked_at": { "$lt": cutoff_date }
    })
    
    print(f"Cleaned up {result.deleted_count} old tokens")
```

## Testing Scenarios

### Test 1: Normal Refresh
```python
# Arrange
user = create_user()
token_1 = login(user)

# Act
response = refresh(token_1)
token_2 = response.refresh_token

# Assert
assert token_1 != token_2
assert token_1_is_revoked()
assert token_2_is_valid()
```

### Test 2: Reuse Detection
```python
# Arrange
user = create_user()
token_1 = login(user)
token_2 = refresh(token_1)  # Token_1 now revoked

# Act
response = refresh(token_1)  # Try to reuse Token_1

# Assert
assert response.status == 401
assert response.message == "Token reuse detected"
assert all_user_tokens_revoked()
```

### Test 3: Race Condition (Client handles)
```python
# Client-side test
# Arrange
token_1 = get_current_token()

# Act: Simulate 2 tabs
promise_1 = fetch_protected_resource()  # Triggers 401
promise_2 = fetch_protected_resource()  # Triggers 401

results = await Promise.all([promise_1, promise_2])

# Assert: Only 1 refresh request sent
assert refresh_call_count == 1
assert results[0].success == True
assert results[1].success == True
```

## Comparison with Alternatives

| Approach | Theft Detection | Race Condition | Complexity |
|----------|-----------------|----------------|------------|
| **No Rotation** | ❌ None | ✅ No issue | ⭐ Simple |
| **Rotation + Reuse** | ✅ Excellent | ⚠️ Client must handle | ⭐⭐⭐ Medium |
| **Rotation + Grace** | ⚠️ Delayed (5s) | ✅ Auto-handled | ⭐⭐⭐⭐ Complex |

## Conclusion

Token rotation with reuse detection provides:
- ✅ Strong security against token theft
- ✅ Automatic breach detection and response
- ✅ Audit trail for forensics
- ⚠️ Requires proper client implementation

**Best for:** Production applications where security is critical

**Trade-off:** Increased client complexity (need proper request deduplication)
