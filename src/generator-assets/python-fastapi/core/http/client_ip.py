from __future__ import annotations

import ipaddress
import os
from functools import lru_cache
from typing import TYPE_CHECKING

from dotenv import dotenv_values

if TYPE_CHECKING:
    from starlette.requests import Request
    from starlette.types import Scope

DEFAULT_TRUSTED_PROXY_CIDRS = "127.0.0.1/32,::1/128"

Network = ipaddress.IPv4Network | ipaddress.IPv6Network


@lru_cache(maxsize=1)
def _dotenv() -> dict[str, str]:
    from ..config import settings

    files = settings.model_config.get("env_file") or ()
    if isinstance(files, str | os.PathLike):
        files = (files,)
    values: dict[str, str] = {}
    for file in files:
        if file and os.path.isfile(file):
            values.update({k: v for k, v in dotenv_values(file).items() if v is not None})
    return values


def env_setting(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None:
        value = _dotenv().get(name)
    value = value.strip() if value else None
    return value or None


@lru_cache(maxsize=8)
def _networks(raw: str) -> tuple[Network, ...]:
    networks: list[Network] = []
    for part in raw.split(","):
        token = part.strip()
        if not token:
            continue
        try:
            networks.append(ipaddress.ip_network(token, strict=False))
        except ValueError:
            continue
    return tuple(networks)


def trusted_networks() -> tuple[Network, ...]:
    return _networks(env_setting("TRUSTED_PROXY_CIDRS") or DEFAULT_TRUSTED_PROXY_CIDRS)


def _parse_ip(raw: str | None) -> str | None:
    if not raw:
        return None
    value = raw.strip()
    if not value or value.lower() == "unknown":
        return None
    if value.startswith("[") and "]" in value:
        value = value[1 : value.index("]")]
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def _is_trusted(peer: str | None) -> bool:
    if not peer:
        return False
    address = ipaddress.ip_address(peer)
    return any(address in network for network in trusted_networks())


def client_ip_from_scope(scope: Scope, *, allow_x_forwarded_for: bool = True) -> str:
    client = scope.get("client")
    peer = _parse_ip(client[0]) if client else None
    if not _is_trusted(peer):
        return peer or "unknown"
    headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
    real_ip = _parse_ip(headers.get("x-real-ip"))
    if real_ip:
        return real_ip
    forwarded = headers.get("x-forwarded-for")
    if allow_x_forwarded_for and forwarded:
        hop = _parse_ip(forwarded.split(",")[-1])
        if hop:
            return hop
    return peer or "unknown"


def client_ip(request: Request, *, allow_x_forwarded_for: bool = True) -> str:
    return client_ip_from_scope(request.scope, allow_x_forwarded_for=allow_x_forwarded_for)


__all__ = [
    "DEFAULT_TRUSTED_PROXY_CIDRS",
    "client_ip",
    "client_ip_from_scope",
    "env_setting",
    "trusted_networks",
]
