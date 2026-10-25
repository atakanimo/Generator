"""Mongo dokümanı ↔ JSON satırı (api-contract §4): `_id` → `id`, ObjectId → string, `Decimal128` → `Decimal`
(JSON'da string), tarih UTC `….fffZ`. Ters yön (`to_storage`): `Decimal` → `Decimal128`."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Any

from bson import Decimal128, ObjectId
from pydantic import PlainSerializer


def format_utc(value: datetime) -> str:
    value = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return f"{value.strftime('%Y-%m-%dT%H:%M:%S')}.{value.microsecond // 1000:03d}Z"


UtcDateTime = Annotated[datetime, PlainSerializer(format_utc, return_type=str, when_used="json")]
"""Satır modellerinde tarih: Mongo'dan saat dilimsiz gelir, UTC sayılır."""


def utc_now() -> datetime:
    """Mongo milisaniye saklar; yazılan değer okunanla aynı olsun diye milisaniyeye kırpılır."""
    now = datetime.now(UTC)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


def to_wire(doc: Any) -> Any:
    if isinstance(doc, dict):
        return {("id" if k == "_id" else k): to_wire(v) for k, v in doc.items()}
    if isinstance(doc, list):
        return [to_wire(v) for v in doc]
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, Decimal128):
        return doc.to_decimal()
    return doc


def to_storage(value: Any) -> Any:
    """Yazılacak doküman / değişiklikler: `Decimal` (alt objelerde de) Mongo'nun `Decimal128`'ine çevrilir."""
    if isinstance(value, dict):
        return {k: to_storage(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_storage(v) for v in value]
    if isinstance(value, Decimal):
        return Decimal128(value)
    return value


__all__ = ["UtcDateTime", "format_utc", "to_storage", "to_wire", "utc_now"]
