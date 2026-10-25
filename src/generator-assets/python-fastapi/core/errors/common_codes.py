"""Sözleşme hata kodları (api-contract §1): her stack'te aynı sayılar, HTTP status ile aynı.

Projeye özel alt kodlar (4xx türü 460–479, 5xx türü 560–579) projenin kendi kod dosyasında durur.
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
    EMAIL_NOT_VERIFIED = 463
    INTERNAL_SERVER_ERROR = 500
    SERVICE_UNAVAILABLE = 503


__all__ = ["CommonErrorCodes"]
