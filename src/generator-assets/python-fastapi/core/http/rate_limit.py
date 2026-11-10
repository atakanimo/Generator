from __future__ import annotations

import math
import re
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

import jwt
from starlette.requests import Request

from ..crud.messages import crud_text
from ..errors.common_codes import CommonErrorCodes
from .client_ip import client_ip_from_scope, env_setting
from .contract import error_response, request_context

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Receive, Scope, Send

RateLimitKey = Literal["ip", "user", "ip-path", "header"]


@dataclass(frozen=True)
class RateLimitPolicy:
    name: str
    limit: str
    key: RateLimitKey
    path: str
    methods: tuple[str, ...] = ()
    key_header: str | None = None
    ip_ceiling: str | None = None


AUTH_RATE_LIMIT_POLICY = RateLimitPolicy(
    name="auth",
    limit="10/60",
    key="ip-path",
    methods=("POST",),
    path=r"^/auth/(login|register|verify-email|send-otp|forgot-password|reset-password|google|apple|set-password)/?$",
)

_ADMIN_PATH = re.compile(r"^/(admin-crud|admin)(/|$)", re.IGNORECASE)
_MAX_WINDOWS = 10_000


@dataclass(frozen=True)
class _Limit:
    count: int
    window: float


@dataclass(frozen=True)
class _Resolved:
    policy: RateLimitPolicy
    pattern: re.Pattern[str]
    limit: _Limit | None
    ceiling: _Limit | None


def _env_name(name: str) -> str:
    return f"RATE_LIMIT_{name.upper().replace('-', '_')}"


def _read_limit(key: str, default: str) -> _Limit | None:
    if (env_setting("RATE_LIMIT_ENABLED") or "true").lower() == "false":
        return None
    value = env_setting(key) or default
    match = re.fullmatch(r"(\d+)/(\d+)", value)
    if not match or int(match.group(2)) == 0:
        raise RuntimeError(f"{key} '<adet>/<saniye>' biçiminde olmalı: {value}")
    count = int(match.group(1))
    return None if count == 0 else _Limit(count, float(match.group(2)))


def _resolve(policy: RateLimitPolicy) -> _Resolved:
    if policy.key == "header" and (not policy.key_header or not policy.ip_ceiling):
        raise RuntimeError(f"{policy.name}: 'header' anahtarı key_header ve ip_ceiling ister.")
    name = _env_name(policy.name)
    return _Resolved(
        policy=policy,
        pattern=re.compile(policy.path, re.IGNORECASE),
        limit=_read_limit(name, policy.limit),
        ceiling=_read_limit(f"{name}_IP", policy.ip_ceiling) if policy.ip_ceiling else None,
    )


def _user_id(request: Request) -> str | None:
    from ..config import settings

    header = request.headers.get("authorization") or ""
    if not header.lower().startswith("bearer "):
        return None
    audience = getattr(settings, "JWT_AUDIENCE", "") or None
    try:
        claims = jwt.decode(
            header[7:].strip(),
            settings.JWT_SECRET,
            algorithms=[getattr(settings, "JWT_ALGORITHM", "HS256")],
            issuer=getattr(settings, "JWT_ISSUER", "") or None,
            audience=audience,
            options={"require": ["sub", "exp"], "verify_aud": bool(audience)},
        )
    except jwt.InvalidTokenError:
        return None
    return str(claims["sub"])


def _partition_key(request: Request, key: RateLimitKey, key_header: str | None = None) -> str | None:
    ip = f"ip:{client_ip_from_scope(request.scope)}"
    if key == "ip-path":
        return f"{ip}|{request.url.path}"
    if key == "user":
        user_id = _user_id(request)
        return f"user:{user_id}" if user_id else ip
    if key == "header":
        value = (request.headers.get(key_header or "") or "").strip()
        return f"key:{value}" if value else None
    return ip


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        from ..config import settings
        from .rate_limit_policies import CUSTOM_RATE_LIMIT_POLICIES

        self.app = app
        self._prefix = str(getattr(settings, "API_PREFIX", "/api")).rstrip("/")
        self._general = _read_limit("RATE_LIMIT_GENERAL", "120/60")
        self._admin_read = _read_limit("RATE_LIMIT_ADMIN_READ", "600/900")
        self._admin_write = _read_limit("RATE_LIMIT_ADMIN_WRITE", "120/900")
        self._policies = [_resolve(p) for p in (AUTH_RATE_LIMIT_POLICY, *CUSTOM_RATE_LIMIT_POLICIES)]
        self._windows: dict[str, list[float]] = {}

    def _hit(self, key: str, limit: _Limit) -> int:
        now = time.monotonic()
        entry = self._windows.get(key)
        if entry is None or entry[1] <= now:
            self._windows[key] = [1, now + limit.window]
            if len(self._windows) > _MAX_WINDOWS:
                for k in [k for k, v in self._windows.items() if v[1] <= now]:
                    del self._windows[k]
            return 0
        entry[0] += 1
        return 0 if entry[0] <= limit.count else max(1, math.ceil(entry[1] - now))

    def _wait(self, request: Request, relative: str) -> int:
        method = request.method.upper()
        for resolved in self._policies:
            policy = resolved.policy
            if not resolved.pattern.search(relative) or (policy.methods and method not in policy.methods):
                continue
            if resolved.ceiling:
                wait = self._hit(f"ceiling:{policy.name}|{_partition_key(request, 'ip')}", resolved.ceiling)
                if wait:
                    return wait
            key = _partition_key(request, policy.key, policy.key_header) if resolved.limit else None
            return self._hit(f"{policy.name}|{key}", resolved.limit) if key and resolved.limit else 0

        profile, limit = "general", self._general
        if _ADMIN_PATH.search(relative):
            read = method in ("GET", "HEAD") or re.search(r"/get-all/?$", relative, re.IGNORECASE) is not None
            profile, limit = ("admin-read", self._admin_read) if read else ("admin-write", self._admin_write)
        if limit is None:
            return 0
        return self._hit(f"{profile}|{_partition_key(request, 'user')}", limit)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path: str = scope.get("path", "") if scope["type"] == "http" else ""
        if not path.lower().startswith(f"{self._prefix.lower()}/") or scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return
        relative = path[len(self._prefix) :]
        if relative.lower() == "/health":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        wait = self._wait(request, relative)
        if not wait:
            await self.app(scope, receive, send)
            return

        code = int(CommonErrorCodes.TOO_MANY_REQUESTS)
        with request_context(request):
            response = error_response(
                code, code, crud_text("too_many_requests_header"), crud_text("too_many_requests")
            )
        response.headers["Retry-After"] = str(wait)
        await response(scope, receive, send)


__all__ = ["AUTH_RATE_LIMIT_POLICY", "RateLimitKey", "RateLimitMiddleware", "RateLimitPolicy"]
