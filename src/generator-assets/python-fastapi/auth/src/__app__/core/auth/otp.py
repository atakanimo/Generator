# @auth-file register|password-reset
"""6 haneli e-posta kodu: CSPRNG, hash'li saklanır, 10 dk, en fazla 5 deneme."""

from __future__ import annotations

import hmac
import secrets
from datetime import timedelta

from __app__.core.auth.tokens import sha256

OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5


def new_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(code: str) -> str:
    return sha256(code)


def otp_matches(code: str, code_hash: str) -> bool:
    return hmac.compare_digest(hash_otp(code), code_hash)
