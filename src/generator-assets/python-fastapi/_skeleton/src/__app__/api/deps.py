"""FastAPI dependency'leri: kimlik (JWT HS256, `sub` + `role`), admin yetkisi, veritabanı.

Anlam .NET iskeletiyle aynı: `sub` kullanıcı id'si, `role` rol (string ya da liste); admin uçları `ADMIN_ROLE`'ü ister.
Token yok / geçersiz → 401, rol yok → 403; `ContractRoute` ikisini de sözleşme zarfına çevirir.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from __app__.core.config import settings
from __app__.core.db import Database, get_db

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True, slots=True)
class CurrentUser:
    id: str
    roles: frozenset[str]

    @property
    def is_admin(self) -> bool:
        return settings.ADMIN_ROLE in self.roles


def decode_token(token: str) -> CurrentUser:
    try:
        claims = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER or None,
            audience=settings.JWT_AUDIENCE or None,
            options={"require": ["sub", "exp"], "verify_aud": bool(settings.JWT_AUDIENCE)},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401) from exc
    raw_role = claims.get("role")
    roles = [raw_role] if isinstance(raw_role, str) else raw_role if isinstance(raw_role, list) else []
    return CurrentUser(id=str(claims["sub"]), roles=frozenset(str(r) for r in roles))


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> CurrentUser:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401)
    return decode_token(credentials.credentials)


def require_admin(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=403)
    return user


UserDep = Annotated[CurrentUser, Depends(get_current_user)]
AdminDep = Annotated[CurrentUser, Depends(require_admin)]
DbDep = Annotated[Database, Depends(get_db)]
