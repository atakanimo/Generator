"""Servis hook'ları (üç stack'te aynı set, Python'da snake_case). Varsayılanlar boş; modülün `hooks.py`'si override eder.

`before_*` işlemi durdurmak için `AppError` fırlatır. `after_*` yazılan / silinen satırla çalışır ve geri alınmaz:
hata fırlatırsa cevap hata olur ama yazma kalır; tutarlılık gereken kontrol `before_*`'a yazılır.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

if TYPE_CHECKING:
    from .list_body import ListBody
    from .sort import SortSpec

Doc = dict[str, Any]


class ServiceHooks[TFilters: BaseModel, TCreate: BaseModel, TUpdate: BaseModel, TRow: BaseModel]:
    def default_sort(self) -> SortSpec | None:
        """İstekte `sortBy` yoksa kullanılan sıralama; `None` → `createdAt desc, _id desc`."""
        return None

    async def before_list(self, query: Doc, body: ListBody[TFilters]) -> Doc:
        return query

    async def before_get_by_id(self, query: Doc) -> Doc:
        return query

    async def before_create(self, doc: Doc, body: TCreate) -> None:
        """`doc` yazılacak doküman; değiştirilebilir."""

    async def before_update(self, current: Doc, changes: Doc, body: TUpdate) -> None:
        """`changes` yazılacak alanlar; değiştirilebilir."""

    async def before_delete(self, current: Doc) -> None:
        pass

    async def after_create(self, row: TRow) -> None:
        pass

    async def after_update(self, row: TRow) -> None:
        pass

    async def after_delete(self, row: TRow) -> None:
        pass

    async def map_rows(self, rows: list[TRow]) -> list[TRow]:
        """List sayfasının bütün satırları (getOne'da tek satır), tek çağrıda; aynı sırada döner."""
        return rows


__all__ = ["Doc", "ServiceHooks"]
