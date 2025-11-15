import bcrypt

def hash_password(password: str) -> str:
  """Hash password using bcrypt"""
  salt = bcrypt.gensalt()
  hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
  return hashed.decode('utf-8')

def verify_password(hashed: str, password: str) -> bool:
    """Verify password against bcrypt hash"""
    try:
        return bcrypt.checkpw(
            password.encode('utf-8'),
            hashed.encode('utf-8')
        )
    except Exception as e:
        print(f"Password verification error: {e}")
        return False