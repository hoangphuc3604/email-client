from cryptography.fernet import Fernet
from app.config import settings
import hashlib

# Initialize Fernet with the key from environment variables
# Ensure ENCRYPTION_KEY is set in your .env file
try:
    cipher_suite = Fernet(settings.ENCRYPTION_KEY)
except Exception as e:
    print(f"Warning: Encryption key invalid or missing. Token encryption will fail. Error: {e}")
    cipher_suite = None

def encrypt_token(token: str) -> str:
    """Encrypt a token for storage in the database"""
    if not token:
        return None
    if not cipher_suite:
        raise ValueError("Encryption key not configured")
    return cipher_suite.encrypt(token.encode()).decode()

def decrypt_token(encrypted_token: str) -> str:
    """Decrypt a token retrieved from the database"""
    if not encrypted_token:
        return None
    if not cipher_suite:
        raise ValueError("Encryption key not configured")
    return cipher_suite.decrypt(encrypted_token.encode()).decode()

def hash_token(token: str) -> str:
    """Hash a token for storage (SHA256)"""
    return hashlib.sha256(token.encode()).hexdigest()
