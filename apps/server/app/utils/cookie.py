import os
from fastapi import Request
from app.config import Settings

settings = Settings()

def get_cookie_settings(request: Request) -> dict:
    is_production = settings.ENVIRONMENT.lower() == "production"
    origin = request.headers.get("origin", "")
    
    is_cross_origin = origin and origin not in str(request.base_url)
    
    if is_production and is_cross_origin:
        samesite = "none"
    elif is_production:
        samesite = "strict"
    else:
        samesite = "lax"

    if is_production:
        cookie_path = "/api/v1/auth"
    else:
        # use root path in development so cookies are sent for proxied requests
        cookie_path = "/"
    
    return {
        "httponly": True,
        "secure": is_production,
        "samesite": samesite,
        "max_age": 7 * 24 * 60 * 60,
        "path": cookie_path
    }
