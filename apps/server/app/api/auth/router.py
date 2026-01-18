from fastapi import APIRouter, Depends, HTTPException, status, Body, Response, Request, Cookie
from app.api.auth.service import AuthService
from app.api.auth.models import (
    RegisterRequest,
    LoginRequest,
    GoogleAuthRequest,
    AuthResponseWithoutRefreshToken,
    TokenResponse,
    UserInfo,
)
from app.api.auth.dependencies import get_auth_service, get_current_user
from app.models.api_response import APIResponse
from app.utils.cookie import get_cookie_settings
from app.utils.google_auth import get_google_auth_url
from app.utils.jwt import verify_token
import asyncio
from typing import Dict, Optional
import time

router = APIRouter(prefix="/auth", tags=["Auth"])

# Concurrency handling for refresh endpoint
# In production, use Redis for multi-instance deployment
_refresh_cache: Dict[str, Dict] = {}  # user_id -> {tokens, timestamp, queue}
_REFRESH_CACHE_TTL = 30  # seconds

async def _get_cached_refresh(user_id: str) -> Optional[Dict]:
    """Get cached refresh result if still valid"""
    if user_id in _refresh_cache:
        cache_entry = _refresh_cache[user_id]
        # Check if cache entry has required fields
        if "timestamp" in cache_entry and "tokens" in cache_entry:
            if time.time() - cache_entry["timestamp"] < _REFRESH_CACHE_TTL:
                return cache_entry["tokens"]
            else:
                # Clean up expired cache
                del _refresh_cache[user_id]
    return None

async def _set_cached_refresh(user_id: str, tokens: Dict):
    """Cache refresh result"""
    _refresh_cache[user_id] = {
        "tokens": tokens,
        "timestamp": time.time()
    }

async def _wait_for_refresh(user_id: str) -> Dict:
    """Wait for ongoing refresh to complete"""
    if user_id not in _refresh_cache:
        return None

    cache_entry = _refresh_cache[user_id]
    if "queue" not in cache_entry:
        cache_entry["queue"] = []

    # Create a future to wait for
    future = asyncio.Future()
    cache_entry["queue"].append(future)

    try:
        return await asyncio.wait_for(future, timeout=10.0)  # 10 second timeout
    except asyncio.TimeoutError:
        # Remove ourselves from queue if timed out
        if user_id in _refresh_cache and "queue" in _refresh_cache[user_id]:
            _refresh_cache[user_id]["queue"] = [
                f for f in _refresh_cache[user_id]["queue"] if not f.done()
            ]
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Refresh request timed out"
        )

def _notify_waiting_refresh(user_id: str, tokens: Dict):
    """Notify all waiting refresh requests"""
    if user_id in _refresh_cache and "queue" in _refresh_cache[user_id]:
        queue = _refresh_cache[user_id]["queue"]
        for future in queue:
            if not future.done():
                future.set_result(tokens)
        _refresh_cache[user_id]["queue"] = []

@router.get("/google/url", response_model=APIResponse[str])
async def get_google_url():
    """Get Google OAuth2 authorization URL"""
    url = get_google_auth_url()
    return APIResponse(data=url, message="Authorization URL generated successfully")

@router.post("/register", response_model=APIResponse[AuthResponseWithoutRefreshToken], status_code=status.HTTP_201_CREATED)
async def register(
    register_request: RegisterRequest = Body(...),
    request: Request = None,
    response: Response = None,
    auth_service: AuthService = Depends(get_auth_service)
):
    try:
        result = await auth_service.register(register_request.email, register_request.password, register_request.name)
        
        cookie_settings = get_cookie_settings(request)
        response.set_cookie(
            key="refresh_token",
            value=result.refresh_token,
            **cookie_settings
        )
        
        return APIResponse(
            data=AuthResponseWithoutRefreshToken(
                access_token=result.access_token,
                user=result.user
            ),
            message="Registration successful"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/login", response_model=APIResponse[AuthResponseWithoutRefreshToken])
async def login(
    credentials: LoginRequest = Body(...),
    request: Request = None,
    response: Response = None,
    auth_service: AuthService = Depends(get_auth_service)
):
    try:
        result = await auth_service.login(credentials.email, credentials.password)
        
        cookie_settings = get_cookie_settings(request)
        response.set_cookie(
            key="refresh_token",
            value=result.refresh_token,
            **cookie_settings
        )
        
        return APIResponse(
            data=AuthResponseWithoutRefreshToken(
                access_token=result.access_token,
                user=result.user
            ),
            message="Login successful"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )

@router.post("/google", response_model=APIResponse[AuthResponseWithoutRefreshToken])
async def google_login(
    google_request: GoogleAuthRequest = Body(...),
    request: Request = None,
    response: Response = None,
    auth_service: AuthService = Depends(get_auth_service)
):
    try:
        result = await auth_service.google_login(google_request.code)
        
        cookie_settings = get_cookie_settings(request)
        response.set_cookie(
            key="refresh_token",
            value=result.refresh_token,
            **cookie_settings
        )
        
        return APIResponse(
            data=AuthResponseWithoutRefreshToken(
                access_token=result.access_token,
                user=result.user
            ),
            message="Google login successful"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )

@router.post("/refresh", response_model=APIResponse[TokenResponse])
async def refresh_token(
    request: Request = None,
    response: Response = None,
    refresh_token: str = Cookie(None, alias="refresh_token"),
    auth_service: AuthService = Depends(get_auth_service)
):
    if not refresh_token:
        print(f"[REFRESH] No refresh token cookie found. Cookies received: {request.cookies}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found in cookies"
        )

    # Extract user_id for caching
    try:
        payload = verify_token(refresh_token, token_type="refresh")
        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Invalid token payload")
    except Exception as e:
        print(f"[REFRESH] Invalid refresh token: {str(e)}")
        response.delete_cookie(key="refresh_token", path="/api/v1/auth")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    # Check cache first
    cached_result = await _get_cached_refresh(user_id)
    if cached_result:
        print(f"[REFRESH] Using cached result for user {user_id}")
        cookie_settings = get_cookie_settings(request)
        response.set_cookie(
            key="refresh_token",
            value=cached_result["refresh_token"],
            **cookie_settings
        )
        return APIResponse(
            data=TokenResponse(
                access_token=cached_result["access_token"],
                expires_in=cached_result.get("expires_in")
            ),
            message="Token refreshed successfully (cached)"
        )

    # Check if refresh is already in progress for this user
    if user_id in _refresh_cache and "processing" in _refresh_cache[user_id]:
        print(f"[REFRESH] Refresh already in progress for user {user_id}, waiting...")
        try:
            result = await _wait_for_refresh(user_id)
            cookie_settings = get_cookie_settings(request)
            response.set_cookie(
                key="refresh_token",
                value=result["refresh_token"],
                **cookie_settings
            )
            return APIResponse(
                data=TokenResponse(
                    access_token=result["access_token"],
                    expires_in=result.get("expires_in")
                ),
                message="Token refreshed successfully (queued)"
            )
        except Exception as e:
            print(f"[REFRESH] Failed to wait for ongoing refresh: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Refresh request failed - please try again"
            )

    # Mark refresh as in progress
    if user_id not in _refresh_cache:
        _refresh_cache[user_id] = {}
    _refresh_cache[user_id]["processing"] = True

    try:
        print(f"[REFRESH] Processing refresh for user {user_id}")
        result = await auth_service.refresh_access_token(refresh_token)

        # Cache the result
        await _set_cached_refresh(user_id, result)

        # Notify waiting requests
        _notify_waiting_refresh(user_id, result)

        cookie_settings = get_cookie_settings(request)
        response.set_cookie(
            key="refresh_token",
            value=result["refresh_token"],
            **cookie_settings
        )

        return APIResponse(
            data=TokenResponse(
                access_token=result["access_token"],
                expires_in=result.get("expires_in")
            ),
            message="Token refreshed successfully"
        )
    except ValueError as e:
        # Clean up processing flag
        if user_id in _refresh_cache:
            _refresh_cache[user_id].pop("processing", None)

        response.delete_cookie(key="refresh_token", path="/api/v1/auth")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    finally:
        # Clean up processing flag
        if user_id in _refresh_cache:
            _refresh_cache[user_id].pop("processing", None)

@router.post("/logout", response_model=APIResponse[None])
async def logout(
    request: Request = None,
    response: Response = None,
    refresh_token: str = Cookie(None, alias="refresh_token"),
    auth_service: AuthService = Depends(get_auth_service)
):
    if refresh_token:
        try:
            await auth_service.revoke_refresh_token(refresh_token)
        except:
            pass
    
    # Delete cookie with the same path it was set with
    response.delete_cookie(
        key="refresh_token",
        path="/api/v1/auth"
    )
    
    return APIResponse(data=None, message="Logged out successfully")


@router.get("/me", response_model=APIResponse[UserInfo])
async def me(
    current_user: UserInfo = Depends(get_current_user)
):
    """Return current authenticated user's info (requires Bearer access token)"""
    return APIResponse(data=current_user, message="Current user retrieved")