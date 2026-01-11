# Authentication & Token Management - Concurrency Handling

## Overview

The refresh endpoint (`/auth/refresh`) now includes concurrency handling to prevent duplicate refresh requests when multiple API calls receive 401 responses simultaneously.

## Implementation Details

### In-Memory Caching Strategy

```python
_refresh_cache: Dict[str, Dict] = {}  # user_id -> {tokens, timestamp, queue}
_REFRESH_CACHE_TTL = 30  # seconds
```

### How It Works

1. **Cache Check**: When a refresh request arrives, first check if there's a cached result for this user within the TTL window.

2. **Ongoing Refresh Detection**: If another refresh is already in progress for the same user, queue the current request and wait for completion.

3. **Processing Flag**: Use a `processing` flag to indicate when a refresh is actively being performed.

4. **Result Caching**: Cache successful refresh results for 30 seconds to serve subsequent requests immediately.

5. **Queue Notification**: When a refresh completes, notify all waiting requests with the result.

### Flow Diagram

```
Request 1 arrives → Check cache → No cache → Set processing=True → Perform refresh → Cache result → Return result
                                                                 ↓
Request 2 arrives → Check cache → Processing=True → Join queue → Wait → Get result from cache
```

### Error Handling

- **Timeout**: Queued requests timeout after 10 seconds with 429 status
- **Cleanup**: Processing flags and expired cache entries are cleaned up automatically
- **Invalid Tokens**: Continue existing error handling for invalid/expired tokens

### Production Considerations

For multi-instance deployments, replace in-memory cache with Redis:

```python
# Use Redis instead of _refresh_cache
redis_client.setex(f"refresh:{user_id}", _REFRESH_CACHE_TTL, json.dumps(tokens))
redis_client.publish(f"refresh:{user_id}:complete", json.dumps(tokens))
```

### Testing

To test concurrency handling:

1. Make multiple concurrent requests that will trigger refresh
2. Verify only one actual refresh call is made to the database
3. Check that all requests receive the same token pair
4. Verify cache expiration works correctly

## Security Notes

- User ID is extracted from JWT payload for cache keying
- Invalid tokens are rejected before caching logic
- Cache TTL prevents stale token reuse
- Token rotation continues to work as before
