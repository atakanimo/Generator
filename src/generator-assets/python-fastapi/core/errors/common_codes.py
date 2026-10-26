"""Sözleşme hata kodları (api-contract §1): her stack'te aynı sayılar, HTTP status ile aynı.

Ortak: `PLAN_REQUIRED` 460 (plan / abonelik yükseltmesi), `UPSTREAM_ERROR` 502 (dış servis hatası). Projeye özel alt
kodlar (4xx türü 461–462 ve 464–479, 5xx türü 560–579) projenin kendi kod dosyasında durur.
"""

from __future__ import annotations

from enum import IntEnum


class CommonErrorCodes(IntEnum):
    BAD_REQUEST = 400
    UNAUTHORIZED = 401
    FORBIDDEN = 403
    NOT_FOUND = 404
    REQUEST_TIMEOUT = 408
    CONFLICT = 409
    UNPROCESSABLE_ENTITY = 422
    TOO_MANY_REQUESTS = 429
    PLAN_REQUIRED = 460
    EMAIL_NOT_VERIFIED = 463
    INTERNAL_SERVER_ERROR = 500
    UPSTREAM_ERROR = 502
    SERVICE_UNAVAILABLE = 503


__all__ = ["CommonErrorCodes"]
