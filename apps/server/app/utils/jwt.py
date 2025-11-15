from datetime import datetime, timedelta
from typing import Optional
import jwt
from app.config import Settings

settings = Settings()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
  """Create JWT access token"""
  to_encode = data.copy()
  if expires_delta:
    expire = datetime.utcnow() + expires_delta
  else:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_DURATION_MINUTE)
  to_encode.update({"exp": expire, "type": "access"})
  encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.ALGORITHM)
  return encoded_jwt

def create_refresh_token(data: dict) -> str:
  """Create JWT refresh token"""
  to_encode = data.copy()
  expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_DURATION_DAY)
  to_encode.update({"exp": expire, "type": "refresh"})
  encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.ALGORITHM)
  return encoded_jwt

def verify_token(token: str, token_type: str = "access") -> Optional[dict]:
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.ALGORITHM])
        if payload.get("type") != token_type:
            return None
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None