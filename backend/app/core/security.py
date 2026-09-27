from datetime import datetime, timedelta, timezone
from typing import Any, Union
import bcrypt
import jwt
from app.core.config import settings


def hash_password(password: str) -> str:
    """Hashes a plain-text password using bcrypt with random salt."""
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain-text password against a stored bcrypt hash."""
    plain_bytes = plain_password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(plain_bytes, hashed_bytes)


def create_access_token(subject: Union[str, Any], role: str, expires_delta: timedelta = None) -> str:
    """Generates a cryptographically signed JWT containing user ID and role."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "sub": str(subject),       # User UUID
        "role": role,              # User Role (DONOR, NGO, DELIVERY_PARTNER, ADMIN)
        "exp": expire,             # Expiration timestamp
        "iat": datetime.now(timezone.utc)  # Issued at
    }

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt