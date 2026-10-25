"""Kimlik (K2): JSON'da `id` = Mongo `_id` (ObjectId hex)."""

from __future__ import annotations

from typing import Annotated, Any

from bson import ObjectId
from bson.errors import InvalidId
from pydantic import AfterValidator, PlainSerializer, PlainValidator, WithJsonSchema


def parse_id(value: str | ObjectId) -> ObjectId | None:
    """Geçerli ObjectId ya da `None` (yol parametresinde bozuk id → 404)."""
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def _check_id(value: str) -> str:
    if parse_id(value) is None:
        raise ValueError("invalid id")
    return value


IdStr = Annotated[str, AfterValidator(_check_id)]
"""Gövde / filtrede id: bozuksa doğrulama hatası (400)."""


def _to_object_id(value: Any) -> ObjectId:
    oid = parse_id(value) if isinstance(value, (str, ObjectId)) else None
    if oid is None:
        raise ValueError("invalid id")
    return oid


RefId = Annotated[
    ObjectId,
    PlainValidator(_to_object_id),
    PlainSerializer(str, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "pattern": "^[0-9a-fA-F]{24}$"}),
]
"""`reference` alanı (gövde, alt obje): JSON'da id string'i, Python'da (ve Mongo'da) `ObjectId`; bozuksa 400."""


__all__ = ["IdStr", "RefId", "parse_id"]
