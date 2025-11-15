import secrets
from bson import ObjectId


def generate_id() -> str:
    """Generate a new ObjectId as string"""
    return str(ObjectId())


def generate_random_string(length: int = 32) -> str:
    """Generate a random URL-safe string"""
    return secrets.token_urlsafe(length)

