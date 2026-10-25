"""Sıralama (api-contract §3): beyaz liste dışı `sortBy` → 400; alan sıralamasına kararlılık için `_id` eklenir."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ..errors.app_error import AppError
from ..errors.common_codes import CommonErrorCodes
from .messages import crud_text

if TYPE_CHECKING:
    from collections.abc import Mapping

    from .list_body import SortOrder

SortSpec = list[tuple[str, int]]

DEFAULT_SORT: SortSpec = [("createdAt", -1), ("_id", -1)]


def resolve_sort(sort_by: str | None, sort_order: SortOrder | None, fields: Mapping[str, str]) -> SortSpec | None:
    """`sortBy` yoksa `None` (varsayılan sıralama hook'tan ya da `DEFAULT_SORT`'tan). `sortOrder` yoksa `desc`."""
    if not sort_by:
        return None
    path = "_id" if sort_by == "id" else fields.get(sort_by)
    if path is None:
        raise AppError(CommonErrorCodes.BAD_REQUEST, crud_text("invalid_sort", field=sort_by))
    direction = 1 if sort_order == "asc" else -1
    return [(path, direction)] if path == "_id" else [(path, direction), ("_id", direction)]


__all__ = ["DEFAULT_SORT", "SortSpec", "resolve_sort"]
