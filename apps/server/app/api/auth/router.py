from fastapi import APIRouter, Depends, HTTPException, status, Body, Response, Request, Cookie
from app.api.auth.service import AuthService
from app.api.auth.models import (
    RegisterRequest, 
    LoginRequest, 
    GoogleAuthRequest, 
    AuthResponseWithoutRefreshToken,
    TokenResponse
)
from app.api.auth.dependencies import get_auth_service
from app.models.api_response import APIResponse
from app.utils.cookie import get_cookie_settings

router = APIRouter(prefix="/auth", tags=["Auth"])

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
        result = await auth_service.google_login(google_request.credential)
        
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found"
        )
    
    try:
        print(refresh_token)
        result = await auth_service.refresh_access_token(refresh_token)
        
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
        response.delete_cookie(key="refresh_token", path="/api/v1/auth")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )

@router.post("/logout", response_model=APIResponse[None])
async def logout(
    response: Response = None,
    refresh_token: str = Cookie(None, alias="refresh_token"),
    auth_service: AuthService = Depends(get_auth_service)
):
    if refresh_token:
        try:
            await auth_service.revoke_refresh_token(refresh_token)
        except:
            pass
    
    response.delete_cookie(
        key="refresh_token",
        path="/api/v1/auth"
    )
    
    return APIResponse(data=None, message="Logged out successfully")