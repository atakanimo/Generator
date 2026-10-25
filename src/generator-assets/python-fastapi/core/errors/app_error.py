"""Servis hatası (K18): servis ve hook'lar `AppError` fırlatır, `core.http.contract` zarfa çevirir."""

from __future__ import annotations

from .common_codes import CommonErrorCodes


class AppError(Exception):
    """`code` sözleşme kodu ya da projeye özel alt kod; HTTP status verilmezse 4xx / 5xx alt kodu ana koda iner."""

    def __init__(self, code: int, message: str, *, status: int | None = None, header: str = "") -> None:
        super().__init__(message)
        self.code = int(code)
        self.message = message
        self.header = header
        self.status = status or _status_for(self.code)


def _status_for(code: int) -> int:
    if 460 <= code <= 479:
        return int(CommonErrorCodes.BAD_REQUEST)
    if 560 <= code <= 579:
        return int(CommonErrorCodes.INTERNAL_SERVER_ERROR)
    return code


__all__ = ["AppError"]
