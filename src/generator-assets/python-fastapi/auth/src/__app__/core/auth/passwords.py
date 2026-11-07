"""bcrypt (cost 12, üç stack'te aynı) ve şifre kuralı."""

from __future__ import annotations

import asyncio
import re

import bcrypt

BCRYPT_COST = 12
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-timing", bcrypt.gensalt(BCRYPT_COST))


def password_policy_error(password: str) -> str | None:
    """8+ karakter, en fazla 72 bayt, bir harf ve bir rakam. Hata → mesaj anahtarı, geçerli → `None`."""
    if len(password) < 8:
        return "passwordTooShort"
    if len(password.encode("utf-8")) > 72:
        return "passwordTooLong"
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "passwordWeak"
    return None


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(BCRYPT_COST)).decode("ascii")


def _check(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("ascii"))
    except ValueError:
        return False


async def hash_password(password: str) -> str:
    return await asyncio.to_thread(_hash, password)


async def verify_password(password: str, hashed: str | None) -> bool:
    """Hash yoksa (kullanıcı yok, sosyal hesap) sahte hash'le karşılaştırır: cevap süresi kayıtlı e-postayı ele vermez."""
    if not hashed:
        await asyncio.to_thread(_check, password, _DUMMY_HASH.decode("ascii"))
        return False
    return await asyncio.to_thread(_check, password, hashed)
