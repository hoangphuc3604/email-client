from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    name: str = Field(..., min_length=1, description="User display name")

class LoginRequest(BaseModel):
  email: EmailStr
  password: str

class GoogleAuthRequest(BaseModel):
  code: str

class RefreshTokenRequest(BaseModel):
  refresh_token: str

class UserInfo(BaseModel):
    id: str
    email: str
    name: str

class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserInfo

class AuthResponseWithoutRefreshToken(BaseModel):
    access_token: str
    user: UserInfo

class TokenResponse(BaseModel):
    access_token: str
    expires_in: Optional[int] = None