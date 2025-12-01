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
        # Use "lax" in development for better cross-tab behavior
        samesite = "lax"

    # Always use /api/v1/auth as the path for consistency
    cookie_path = "/api/v1/auth"
    
    return {
        "httponly": True,
        "secure": is_production,
        "samesite": samesite,
        "max_age": 7 * 24 * 60 * 60,
        "path": cookie_path,
        "domain": None  # Let browser determine the domain
    }
