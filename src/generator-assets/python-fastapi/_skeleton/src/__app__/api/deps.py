"""FastAPI dependency'leri: kimlik (JWT HS256 `sub`, kullanıcı DB'den), admin yetkisi, veritabanı.

Rol token'dan değil `users` kaydından okunur (docs/backend/auth.md "Roller"): rol değişikliği ve askıya alma hemen
geçerli. Token yok / geçersiz / kullanıcı yok → 401, askıda → 403, admin değil → 403; `ContractRoute` zarfa çevirir.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from __app__.core.config import settings
from __app__.core.db import Database, get_db
from __app__.modules.auth.service import load_user

_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True, slots=True)
class CurrentUser:
    id: str
    role: str
    doc: dict[str, Any] = field(compare=False, repr=False)

    @property
    def roles(self) -> frozenset[str]:
        return frozenset({self.role})

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def decode_token(token: str) -> str:
    """Geçerli token'ın `sub`'ı; değilse 401."""
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
    return str(claims["sub"])


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Database, Depends(get_db)],
) -> CurrentUser:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401)
    user_id = decode_token(credentials.credentials)
    user = await load_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=401)
    if user.get("status") == "suspended":
        raise HTTPException(status_code=403)
    return CurrentUser(id=str(user["_id"]), role=str(user.get("role") or "user"), doc=user)


def require_admin(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=403)
    return user


UserDep = Annotated[CurrentUser, Depends(get_current_user)]
AdminDep = Annotated[CurrentUser, Depends(require_admin)]
DbDep = Annotated[Database, Depends(get_db)]
