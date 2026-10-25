"""Update gövdesinde `null` kuralı (api-contract §5, JSON Merge Patch).

Gönderilmeyen alan değişmez; opsiyonel tekil alana `null` alanı temizler (`map_update` `None` bırakır, repository
`$unset` yazar). Zorunlu alan ve dizi `null` almaz: update şemasında `NotNull[T]` (400; dizi `[]` ile boşalır).
"""

from __future__ import annotations

from typing import Annotated, Any, TypeVar

from pydantic import BeforeValidator
from pydantic_core import PydanticCustomError

from .messages import crud_text

T = TypeVar("T")


def _reject_null(value: Any) -> Any:
    if value is None:
        raise PydanticCustomError("not_null", crud_text("not_null"))
    return value


NotNull = Annotated[T | None, BeforeValidator(_reject_null)]
"""Update alanı: gönderilmeyebilir (varsayılan `None` doğrulanmaz), gönderilirse `null` olamaz."""


__all__ = ["NotNull"]
