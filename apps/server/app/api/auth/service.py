from typing import Optional
from pymongo.database import Database
from app.utils.jwt import create_access_token, create_refresh_token, verify_token
from app.utils.password import hash_password, verify_password
from app.utils.google_auth import verify_google_token
from app.api.auth.models import AuthResponse, UserInfo
from datetime import datetime, timedelta
from bson import ObjectId
from app.config import Settings


class AuthService:
    def __init__(self, db: Database):
        self.db = db
        self.users_collection = db["users"]
        self.refresh_tokens_collection = db["refresh_tokens"]
    
    async def _revoke_all_user_tokens(self, user_id: ObjectId):
        await self.refresh_tokens_collection.update_many(
            {"user_id": user_id, "revoked": False},
            {"$set": {"revoked": True, "revoked_at": datetime.utcnow()}}
        )
    
    async def _create_and_store_tokens(self, user: dict) -> dict:
        user_id_str = str(user["_id"])
        
        await self._revoke_all_user_tokens(user["_id"])
        
        token_data = {"sub": user_id_str, "email": user["email"]}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)
        
        await self.refresh_tokens_collection.insert_one({
            "user_id": user["_id"],
            "token": refresh_token,
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=7),
            "revoked": False
        })
        
        return {
            "access_token": access_token,
            "refresh_token": refresh_token
        }
    
    async def register(self, email: str, password: str, name: str) -> AuthResponse:
        """Register new user with email and password"""
        # Check if user already exists
        existing_user = await self.users_collection.find_one({"email": email})
        if existing_user:
            raise ValueError("Email already registered")
        
        # Hash password
        password_hash = hash_password(password)
        
        # Create user document
        now = datetime.utcnow()
        user_doc = {
            "email": email,
            "name": name,
            "password_hash": password_hash,
            "auth_provider": "email",
            "created_at": now,
            "updated_at": now
        }
        
        # Insert user
        result = await self.users_collection.insert_one(user_doc)
        user = await self.users_collection.find_one({"_id": result.inserted_id})
        
        tokens = await self._create_and_store_tokens(user)
        
        return AuthResponse(
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            user=UserInfo(
                id=str(user["_id"]),
                email=user["email"],
                name=user.get("name", user["email"])
            )
        )
    
    async def login(self, email: str, password: str) -> AuthResponse:
        """Email/password login"""
        # Find user
        user = await self.users_collection.find_one({"email": email})
        if not user:
            raise ValueError("Invalid email or password")
        
        # Verify password
        if not verify_password(user["password_hash"], password):
            raise ValueError("Invalid email or password")
        
        tokens = await self._create_and_store_tokens(user)
        
        return AuthResponse(
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            user=UserInfo(
                id=str(user["_id"]),
                email=user["email"],
                name=user.get("name", user["email"])
            )
        )
    
    async def google_login(self, credential: str) -> AuthResponse:
        """Google OAuth login"""
        # Verify Google token
        google_user = await verify_google_token(credential)
        if not google_user:
            raise ValueError("Invalid Google credential")
        
        email = google_user["email"]
        
        # Find or create user
        user = await self.users_collection.find_one({"email": email})
        if not user:
            # First-time user - create account
            result = await self.users_collection.insert_one({
                "email": email,
                "name": google_user["name"],
                "google_id": google_user["google_id"],
                "created_at": datetime.utcnow(),
                "auth_provider": "google"
            })
            user = await self.users_collection.find_one({"_id": result.inserted_id})
        else:
            # Update Google ID if missing
            if "google_id" not in user:
                await self.users_collection.update_one(
                    {"_id": user["_id"]},
                    {"$set": {"google_id": google_user["google_id"]}}
                )
        
        tokens = await self._create_and_store_tokens(user)
        
        return AuthResponse(
            access_token=tokens["access_token"],
            refresh_token=tokens["refresh_token"],
            user=UserInfo(
                id=str(user["_id"]),
                email=user["email"],
                name=user.get("name", email)
            )
        )
    
    async def refresh_access_token(self, refresh_token: str) -> dict:
        payload = verify_token(refresh_token, token_type="refresh")
        if not payload:
            raise ValueError("Invalid or expired refresh token")
        
        token_doc = await self.refresh_tokens_collection.find_one({"token": refresh_token})
        if not token_doc:
            raise ValueError("Refresh token not found")
        
        print(token_doc)
        
        if token_doc.get("revoked") == True:
            user_id = token_doc["user_id"]
            await self._revoke_all_user_tokens(user_id)
            raise ValueError("Token reuse detected - all sessions revoked for security")
        
        if token_doc.get("expires_at") and token_doc["expires_at"] < datetime.utcnow():
            await self.refresh_tokens_collection.update_one(
                {"_id": token_doc["_id"]},
                {"$set": {"revoked": True, "revoked_at": datetime.utcnow()}}
            )
            raise ValueError("Refresh token expired")
        
        await self.refresh_tokens_collection.update_one(
            {"_id": token_doc["_id"]},
            {"$set": {"revoked": True, "revoked_at": datetime.utcnow()}}
        )
        
        user = await self.users_collection.find_one({"_id": token_doc["user_id"]})
        if not user:
            raise ValueError("User not found")
        
        token_data = {"sub": payload["sub"], "email": payload["email"]}
        new_access_token = create_access_token(token_data)
        new_refresh_token = create_refresh_token(token_data)
        
        await self.refresh_tokens_collection.insert_one({
            "user_id": token_doc["user_id"],
            "token": new_refresh_token,
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(days=7),
            "revoked": False,
            "parent_token_id": token_doc["_id"]
        })
        
        settings = Settings()
        expires_in = settings.ACCESS_TOKEN_DURATION_MINUTE * 60
        
        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "expires_in": expires_in
        }
    
    async def get_current_user(self, access_token: str) -> UserInfo:
        """Get current user from access token"""
        payload = verify_token(access_token, token_type="access")
        if not payload:
            raise ValueError("Invalid or expired access token")
        
        user_id = payload["sub"]
        user = await self.users_collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise ValueError("User not found")
        
        return UserInfo(
            id=str(user["_id"]),
            email=user["email"],
            name=user.get("name", user["email"])
        )
    
    async def revoke_refresh_token(self, refresh_token: str):
        await self.refresh_tokens_collection.update_one(
            {"token": refresh_token},
            {"$set": {"revoked": True, "revoked_at": datetime.utcnow()}}
        )