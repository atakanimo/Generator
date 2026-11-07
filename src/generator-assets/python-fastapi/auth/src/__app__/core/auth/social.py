# @auth-file google|apple
"""Google / Apple kimlik token'ı doğrulama (JWKS, PyJWT). Client id'ler `.env`'de (virgülle)."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

import jwt
from jwt import PyJWKClient

from __app__.core.config import settings

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class SocialIdentity:
    provider_user_id: str
    email: str | None
    email_verified: bool
    name: str | None = None
    # Token'ın verildiği istemci kimliği (Apple kod takası aynı `client_id`'yi ister).
    audience: str | None = None


def _ids(raw: str, key: str) -> list[str]:
    ids = [s.strip() for s in raw.split(",") if s.strip()]
    if not ids:
        log.error("%s ayarlı değil (.env)", key)
    return ids


def _verify(token: str, jwks: PyJWKClient, issuer: list[str] | str, audience: list[str]) -> dict | None:
    try:
        key = jwks.get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=["RS256"], audience=audience, issuer=issuer)
    except (jwt.PyJWTError, ValueError):
        return None


def _identity(claims: dict | None, *, with_name: bool) -> SocialIdentity | None:
    if not claims or not claims.get("sub"):
        return None
    email = claims.get("email")
    verified = claims.get("email_verified") in (True, "true")
    aud = claims.get("aud")
    return SocialIdentity(
        provider_user_id=str(claims["sub"]),
        email=email.lower() if isinstance(email, str) else None,
        email_verified=verified,
        name=claims.get("name") if with_name and isinstance(claims.get("name"), str) else None,
        audience=aud if isinstance(aud, str) else (aud[0] if isinstance(aud, list) and aud else None),
    )


# @if google
_GOOGLE = PyJWKClient("https://www.googleapis.com/oauth2/v3/certs")


async def verify_google_id_token(id_token: str) -> SocialIdentity | None:
    audience = _ids(settings.GOOGLE_CLIENT_IDS, "GOOGLE_CLIENT_IDS")
    if not audience:
        return None
    issuers = ["https://accounts.google.com", "accounts.google.com"]
    claims = await asyncio.to_thread(_verify, id_token, _GOOGLE, issuers, audience)
    return _identity(claims, with_name=True)


# @endif
# @if apple
_APPLE = PyJWKClient("https://appleid.apple.com/auth/keys")


async def verify_apple_identity_token(identity_token: str) -> SocialIdentity | None:
    audience = _ids(settings.APPLE_CLIENT_IDS, "APPLE_CLIENT_IDS")
    if not audience:
        return None
    claims = await asyncio.to_thread(_verify, identity_token, _APPLE, "https://appleid.apple.com", audience)
    return _identity(claims, with_name=False)


# @endif
