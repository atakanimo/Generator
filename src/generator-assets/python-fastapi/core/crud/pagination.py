"""Sayfalama (api-contract §3): `limit` varsayılan 50, en çok 100 (kırpılır); `page` 1'den başlar."""

from __future__ import annotations

from pydantic import BaseModel

DEFAULT_PAGE = 1
DEFAULT_LIMIT = 50
MAX_LIMIT = 100


class PaginatedList[T](BaseModel):
    items: list[T]
    total: int
    hasMore: bool
    currentPage: int
    currentLimit: int


def page_window(page: int | None, limit: int | None) -> tuple[int, int, int]:
    """(sayfa, limit, skip). `limit` < 1 ya da yoksa varsayılan; 100'ü aşarsa 100."""
    current_limit = DEFAULT_LIMIT if limit is None or limit < 1 else min(limit, MAX_LIMIT)
    current_page = page or DEFAULT_PAGE
    return current_page, current_limit, (current_page - 1) * current_limit


__all__ = ["DEFAULT_LIMIT", "MAX_LIMIT", "PaginatedList", "page_window"]
