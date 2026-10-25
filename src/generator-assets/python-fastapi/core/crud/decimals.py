"""`decimal` alanı (api-contract §4, K5): JSON'da string (giriş ve çıkış), Python'da `Decimal`, Mongo'da `Decimal128`.

Girişte sayı (`1.5`) reddedilir (.NET `DecimalStringConverter` ile aynı); `"1.5"`, `"-2"`, `"10.00"` kabul. Çıkışta
üstel gösterim yok (`"100"`, `"0.0001"`). Mongo'ya yazmadan önce `wire.to_storage` `Decimal128`'e çevirir.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Annotated, Any

from pydantic import BeforeValidator, PlainSerializer

_DECIMAL = re.compile(r"^[+-]?\d+(\.\d+)?$")


def _parse_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, str) and _DECIMAL.match(value.strip()):
        return Decimal(value.strip())
    raise ValueError("decimal values must be strings")


def format_decimal(value: Decimal) -> str:
    return format(value, "f")


DecimalStr = Annotated[
    Decimal,
    BeforeValidator(_parse_decimal),
    PlainSerializer(format_decimal, return_type=str, when_used="json"),
]


__all__ = ["DecimalStr", "format_decimal"]
