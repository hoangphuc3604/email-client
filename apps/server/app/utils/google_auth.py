import google_auth_oauthlib.flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from app.config import settings

# Scopes required for the application
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

def get_google_auth_url():
    """
    Generate URL for frontend to redirect user to Google Login
    """
    flow = google_auth_oauthlib.flow.Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
    )
    
    # redirect_uri must match exactly with Google Cloud Console configuration
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    
    authorization_url, state = flow.authorization_url(
        access_type="offline", # Important: to get refresh_token
        include_granted_scopes="true",
        prompt="consent" # Important: force Google to return refresh_token every time
    )
    
    return authorization_url

def exchange_code_for_credentials(code: str):
    """
    Exchange authorization code for credentials (access_token, refresh_token, id_token)
    """
    flow = google_auth_oauthlib.flow.Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
    )
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    
    # Exchange code for token
    flow.fetch_token(code=code)
    
    credentials = flow.credentials
    
    # Get user info from id_token (handled by google-auth-oauthlib or fetch manually)
    session = flow.authorized_session()
    user_info = session.get('https://www.googleapis.com/userinfo/v2/me').json()
    
    return {
        "email": user_info.get("email"),
        "name": user_info.get("name"),
        "picture": user_info.get("picture"),
        "access_token": credentials.token,
        "refresh_token": credentials.refresh_token, # This needs to be stored in DB
        "token_expiry": credentials.expiry
    }
