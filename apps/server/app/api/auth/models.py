from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from pydantic.alias_generators import to_camel

class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

class RegisterRequest(CamelModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")
    name: str = Field(..., min_length=1, description="User display name")

class LoginRequest(CamelModel):
  email: EmailStr
  password: str

class GoogleAuthRequest(CamelModel):
  code: str

class RefreshTokenRequest(CamelModel):
  refresh_token: str

class UserInfo(CamelModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None

class AuthResponse(CamelModel):
    access_token: str
    refresh_token: str
    user: UserInfo

class AuthResponseWithoutRefreshToken(CamelModel):
    access_token: str
    user: UserInfo

class TokenResponse(CamelModel):
    access_token: str
    expires_in: Optional[int] = None