"""Liste filtreleri (api-contract §3) → Mongo sorgusu.

| tür | değer | sorgu |
| --- | --- | --- |
| `id` / `reference` | id ya da id[] | eşitlik / `$in` |
| `regex` | metin | büyük / küçük harf duyarsız "içerir" |
| `eq`, `boolean` | değer | eşitlik |
| `range` | `{ min?, max? }` ya da sayı (`decimal`: string) | `$gte` / `$lte` / eşitlik |
| `date-range` | `{ from?, to? }` ya da tek tarih | UTC: `from` gün başı ≤ x < `to` + 1 gün |
| `enum` | değer ya da dizi | `$in` |
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Literal

from bson import Decimal128
from pydantic import BaseModel, ConfigDict, Field

from .decimals import DecimalStr
from .ids import parse_id

if TYPE_CHECKING:
    from collections.abc import Mapping

FilterKind = Literal["id", "reference", "regex", "eq", "boolean", "range", "date-range", "enum"]


class RangeFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min: float | None = None
    max: float | None = None


class DecimalRangeFilter(BaseModel):
    """`decimal` alanında `range`: sınırlar string (JSON'da decimal string, .NET `RangeFilter<decimal>` ile aynı)."""

    model_config = ConfigDict(extra="forbid")

    min: DecimalStr | None = None
    max: DecimalStr | None = None


class DateRangeFilter(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: datetime | None = Field(default=None, alias="from")
    to: datetime | None = None


RangeValue = RangeFilter | float
DecimalRangeValue = DecimalRangeFilter | DecimalStr
DateRangeValue = DateRangeFilter | datetime


@dataclass(frozen=True)
class FilterField:
    """Filtre adı → Mongo alan yolu ve türü."""

    path: str
    kind: FilterKind


def build_filter_query(filters: BaseModel | None, fields: Mapping[str, FilterField]) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if filters is None:
        return query
    for name, field in fields.items():
        value = getattr(filters, name, None)
        if value is None:
            continue
        condition = _condition(field.kind, value)
        if condition is not None:
            query[field.path] = condition
    return query


def _condition(kind: FilterKind, value: Any) -> Any:
    if kind in ("id", "reference"):
        ids = [parse_id(v) for v in value] if isinstance(value, list) else [parse_id(value)]
        return {"$in": ids} if isinstance(value, list) else ids[0]
    if kind == "regex":
        return {"$regex": re.escape(str(value)), "$options": "i"} if value != "" else None
    if kind == "enum":
        values = value if isinstance(value, list) else [value]
        return {"$in": [getattr(v, "value", v) for v in values]}
    if kind == "range":
        if isinstance(value, (RangeFilter, DecimalRangeFilter)):
            bounds = {op: _bson(v) for op, v in (("$gte", value.min), ("$lte", value.max)) if v is not None}
            return bounds or None
        return _bson(value)
    if kind == "date-range":
        start, end = (value.from_, value.to) if isinstance(value, DateRangeFilter) else (value, value)
        bounds: dict[str, datetime] = {}
        if start is not None:
            bounds["$gte"] = _start_of_utc_day(start)
        if end is not None:
            bounds["$lt"] = _start_of_utc_day(end) + timedelta(days=1)
        return bounds or None
    return _bson(value)


def _bson(value: Any) -> Any:
    return Decimal128(value) if isinstance(value, Decimal) else value


def _start_of_utc_day(value: datetime) -> datetime:
    value = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return value.replace(hour=0, minute=0, second=0, microsecond=0)


__all__ = [
    "DateRangeFilter",
    "DateRangeValue",
    "DecimalRangeFilter",
    "DecimalRangeValue",
    "FilterField",
    "RangeFilter",
    "RangeValue",
    "build_filter_query",
]
