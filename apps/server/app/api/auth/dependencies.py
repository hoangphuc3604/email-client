from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pymongo.database import Database
from app.database import get_db
from app.api.auth.service import AuthService
from app.utils.jwt import verify_token

security = HTTPBearer()

async def get_auth_service(db: Database = Depends(get_db)) -> AuthService:
    """Dependency to get AuthService instance"""
    return AuthService(db)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    auth_service: AuthService = Depends(get_auth_service)
):
    """Dependency to get current authenticated user"""
    token = credentials.credentials
    try:
        user = await auth_service.get_current_user(token)
        return user
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )