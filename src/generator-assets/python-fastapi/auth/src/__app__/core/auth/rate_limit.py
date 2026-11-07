"""IP + uç başına sabit pencere (tek süreç, bellekte). Birden çok instance'ta önüne ortak bir sınırlayıcı konur;
sözleşme aynı kalır: 429 + zarf."""

from __future__ import annotations

import time

from fastapi import Request

from __app__.core.auth.messages import auth_text
from __app__.core.config import settings
from __app__.core.errors.app_error import AppError
from __app__.core.errors.common_codes import CommonErrorCodes

_hits: dict[str, tuple[int, float]] = {}


def client_ip(request: Request) -> str:
    """Behind one reverse proxy (nginx / Docker) the client is the last `X-Forwarded-For` entry (Express `trust proxy 1`)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def auth_rate_limit(key: str):
    """FastAPI dependency: `dependencies=[Depends(auth_rate_limit("login"))]`; dakikada `AUTH_RATE_LIMIT_PER_MINUTE`."""

    async def _limit(request: Request) -> None:
        now = time.monotonic()
        bucket = f"{key}:{client_ip(request)}"
        count, reset_at = _hits.get(bucket, (0, 0.0))
        if reset_at <= now:
            count, reset_at = 0, now + 60
        count += 1
        _hits[bucket] = (count, reset_at)
        if len(_hits) > 10_000:
            for k, (_, r) in list(_hits.items()):
                if r <= now:
                    _hits.pop(k, None)
        if count > settings.AUTH_RATE_LIMIT_PER_MINUTE:
            code = int(CommonErrorCodes.TOO_MANY_REQUESTS)
            raise AppError(code, auth_text("tooManyRequests"), status=code)

    return _limit
