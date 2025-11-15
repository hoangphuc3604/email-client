from google.auth.transport import requests
from google.oauth2 import id_token
from app.config import Settings
from typing import Optional, Dict

settings = Settings()

async def verify_google_token(credential: str) -> Optional[Dict]:
    """Verify Google OAuth credential and return user info"""
    try:
        # Verify the token
        idinfo = id_token.verify_oauth2_token(
            credential, 
            requests.Request(), 
            settings.GOOGLE_CLIENT_ID
        )
        
        # Verify issuer
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            return None
            
        return {
            "email": idinfo.get("email"),
            "name": idinfo.get("name"),
            "google_id": idinfo.get("sub"),
            "picture": idinfo.get("picture")
        }
    except Exception as e:
        print(f"Google token verification failed: {e}")
        return None