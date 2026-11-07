# @auth-file apple
"""Apple refresh token'ı (docs/backend/auth.md "Apple token iptali").

Girişte `authorizationCode` ile alınır, hesap silinince iptal edilir (App Store şartı). `APPLE_TEAM_ID`,
`APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8) yoksa ikisi de atlanır; giriş etkilenmez.
"""

from __future__ import annotations

import logging
import time

import httpx
import jwt

from __app__.core.auth.social import SocialIdentity
from __app__.core.config import settings

log = logging.getLogger(__name__)

_APPLE = "https://appleid.apple.com"
_TIMEOUT = 10.0


def _client_ids() -> list[str]:
    return [s.strip() for s in settings.APPLE_CLIENT_IDS.split(",") if s.strip()]


def _client_secret(client_id: str) -> str | None:
    """`.p8` anahtarıyla imzalı, kısa ömürlü ES256 istemci sırrı."""
    # `.env`'de tek satır: satır sonları `\n` olarak yazılabilir.
    private_key = settings.APPLE_PRIVATE_KEY.replace("\\n", "\n")
    if not settings.APPLE_TEAM_ID or not settings.APPLE_KEY_ID or not private_key:
        log.warning("APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY ayarlı değil: Apple token iptali atlanır")
        return None
    now = int(time.time())
    claims = {"iss": settings.APPLE_TEAM_ID, "iat": now, "exp": now + 300, "aud": _APPLE, "sub": client_id}
    return jwt.encode(claims, private_key, algorithm="ES256", headers={"kid": settings.APPLE_KEY_ID})


async def exchange_apple_code(authorization_code: str, identity: SocialIdentity) -> str | None:
    """Takas olmazsa ya da kod başka bir Apple hesabınınsa `None`; giriş her durumda sürer."""
    client_id = identity.audience or next(iter(_client_ids()), None)
    if not client_id:
        return None
    try:
        secret = _client_secret(client_id)
        if not secret:
            return None
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            res = await http.post(
                f"{_APPLE}/auth/token",
                data={
                    "client_id": client_id,
                    "client_secret": secret,
                    "code": authorization_code,
                    "grant_type": "authorization_code",
                },
            )
        if res.status_code != 200:
            log.info("Apple token exchange failed: %s", res.status_code)
            return None
        body = res.json()
        id_token = body.get("id_token")
        # Kod başka bir Apple hesabınınsa (istemci iki hesabı karıştırdıysa) token saklanmaz.
        subject = jwt.decode(id_token, options={"verify_signature": False}).get("sub") if id_token else None
        if subject != identity.provider_user_id:
            log.warning("Apple token exchange subject mismatch; refresh token discarded")
            return None
        return body.get("refresh_token")
    except (httpx.HTTPError, ValueError, jwt.PyJWTError) as exc:
        log.warning("Apple token exchange error: %s", exc)
        return None


async def revoke_apple_token(refresh_token: str) -> bool:
    """Ayarlı istemci kimlikleri sırayla denenir (token hangisiyle alındıysa onunla iptal edilir)."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            for client_id in _client_ids():
                secret = _client_secret(client_id)
                if not secret:
                    return False
                res = await http.post(
                    f"{_APPLE}/auth/revoke",
                    data={
                        "client_id": client_id,
                        "client_secret": secret,
                        "token": refresh_token,
                        "token_type_hint": "refresh_token",
                    },
                )
                if res.status_code == 200:
                    return True
    except (httpx.HTTPError, ValueError, jwt.PyJWTError) as exc:
        log.warning("Apple revoke error: %s", exc)
        return False
    log.warning("Apple refresh token could not be revoked")
    return False
