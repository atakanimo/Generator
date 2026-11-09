"""Access token (HS256 JWT) ve opak refresh token."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt

from __app__.core.config import settings


def access_token_ttl_seconds() -> int:
    return max(1, settings.JWT_ACCESS_TTL_MINUTES) * 60


def refresh_token_ttl() -> timedelta:
    return timedelta(days=max(1, settings.JWT_REFRESH_TTL_DAYS))


def sign_access_token(user_id: str, role: str, ttl: timedelta | None = None) -> str:
    """`sub`, `role`, `jti`, `iat`, `exp` (+ ayarlıysa `iss` / `aud`)."""
    now = datetime.now(UTC)
    claims: dict[str, object] = {
        "sub": user_id,
        "role": role,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + (ttl if ttl is not None else timedelta(seconds=access_token_ttl_seconds())),
    }
    if settings.JWT_ISSUER:
        claims["iss"] = settings.JWT_ISSUER
    if settings.JWT_AUDIENCE:
        claims["aud"] = settings.JWT_AUDIENCE
    return jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def new_refresh_token() -> str:
    """48 rastgele bayt (base64url); yalnız SHA-256'sı saklanır."""
    return secrets.token_urlsafe(48)


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
