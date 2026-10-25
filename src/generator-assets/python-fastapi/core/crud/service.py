"""CRUD gövdeleri tek yerde (.NET `CrudServiceBase`, Express `base-crud.service` karşılığı).

Modül servisi (`service_generated.py`) yalnızca modüle özel parçaları verir: satır modeli, filtre ve sıralama
alanları, unique alanlar, ilişkiler (kontrol + populate), gizli alanlar. Davranışı değiştirmek için modülün
`service.py`'sinde alt sınıf ya da `hooks.py`.

Sıra: create / update → eşle → ilişki kontrolü (400) → unique (409) → `before_*` → yaz → yeniden oku → `after_*`.
Gizli alanlar (`hidden_fields`) okuma sorgularında projection ile dışarıda kalır; hook'lara giden `current` tamdır.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from ..errors.app_error import AppError
from ..errors.common_codes import CommonErrorCodes
from .export import EXPORT_ROW_LIMIT, render_csv
from .filters import build_filter_query
from .ids import parse_id
from .list_body import ListBody
from .messages import crud_text
from .pagination import PaginatedList, page_window
from .relations import check_relations, populate_docs
from .sort import DEFAULT_SORT, resolve_sort
from .wire import to_storage, to_wire, utc_now

if TYPE_CHECKING:
    from collections.abc import Awaitable, Mapping

    from bson import ObjectId

    from .export import ExportBody
    from .filters import FilterField
    from .hooks import Doc, ServiceHooks
    from .relations import PopulateField, RelationField
    from .repository import CrudRepository


class CrudService[TFilters: BaseModel, TCreate: BaseModel, TUpdate: BaseModel, TRow: BaseModel]:
    row_model: type[TRow]
    filter_fields: ClassVar[Mapping[str, FilterField]] = {}
    sort_fields: ClassVar[Mapping[str, str]] = {}
    unique_fields: ClassVar[tuple[str, ...]] = ()
    relation_fields: ClassVar[tuple[RelationField, ...]] = ()
    populate_fields: ClassVar[tuple[PopulateField, ...]] = ()
    hidden_fields: ClassVar[tuple[str, ...]] = ()
    # Liste sayfasında okunmayan ağır alanlar (`access.detailOnly`): satırda `None`, getOne'da dolu.
    detail_only_fields: ClassVar[tuple[str, ...]] = ()
    # Export (api-contract §2 "Export"): dışa aktarılabilen kolonlar (sırayla; `hidden` hariç) ve ilişki kolonlarının
    # gösterilen alanı (`reference.display`).
    export_fields: ClassVar[tuple[str, ...]] = ()
    export_display: ClassVar[Mapping[str, str]] = {}

    def __init__(
        self, repository: CrudRepository, hooks: ServiceHooks[TFilters, TCreate, TUpdate, TRow]
    ) -> None:
        self.repository = repository
        self.hooks = hooks

    # --- Modüle özel parçalar (override edilebilir) ---------------------------

    def map_create(self, body: TCreate) -> Doc:
        return body.model_dump(mode="python")

    def map_update(self, body: TUpdate) -> Doc:
        """Kısmi güncelleme (JSON Merge Patch): gönderilmeyen alan değişmez, `None` alanı temizler (`$unset`).

        Hangi alanın `null` alabileceğine şema karar verir (`NotNull`: zorunlu alan, dizi).
        """
        return body.model_dump(mode="python", exclude_unset=True)

    def scope(self, query: Doc) -> Doc:
        """Her sorgunun kapsamı (ownership). Varsayılan: bütün kayıtlar."""
        return query

    def to_row(self, doc: Doc) -> TRow:
        return self.row_model.model_validate(to_wire(doc))

    async def check_relations(self, doc: Doc) -> None:
        await check_relations(self.repository, self.relation_fields, doc)

    async def populate(self, docs: list[Doc]) -> list[Doc]:
        return await populate_docs(self.repository, self.populate_fields, docs)

    def read_projection(self) -> Doc | None:
        return dict.fromkeys(self.hidden_fields, 0) or None

    def list_projection(self) -> Doc | None:
        return dict.fromkeys((*self.hidden_fields, *self.detail_only_fields), 0) or None

    async def check_unique(self, doc: Doc, own_id: ObjectId | None) -> None:
        for field in self.unique_fields:
            if doc.get(field) is None:  # gönderilmedi ya da temizleniyor
                continue
            query: Doc = {field: doc[field]}
            if own_id is not None:
                query["_id"] = {"$ne": own_id}
            if await self.repository.exists(query):
                raise _conflict(field)

    # --- CRUD ------------------------------------------------------------------

    async def list(self, body: ListBody[TFilters]) -> PaginatedList[TRow]:
        query = self.scope(build_filter_query(body.filters, self.filter_fields))
        query = await self.hooks.before_list(query, body)
        sort = (
            resolve_sort(body.sortBy, body.sortOrder, self.sort_fields)
            or self.hooks.default_sort()
            or DEFAULT_SORT
        )
        page, limit, skip = page_window(body.page, body.limit)
        total = await self.repository.count(query)
        docs = await self.repository.find_page(query, sort, skip, limit, self.list_projection())
        rows = await self.hooks.map_rows([self.to_row(d) for d in await self.populate(docs)])
        return PaginatedList[TRow](
            items=rows, total=total, hasMore=skip + len(rows) < total, currentPage=page, currentLimit=limit
        )

    async def export_csv(self, body: ExportBody[TFilters]) -> str:
        """Liste sorgusunun aynısı (filtre, kapsam, `before_list`, sıra; populate + `map_rows`), sayfasız; CSV metni."""
        columns = list(body.fields or self.export_fields)
        unknown = next((c for c in columns if c not in self.export_fields), None)
        if unknown is not None:
            raise AppError(CommonErrorCodes.BAD_REQUEST, crud_text("export_unknown_field", field=unknown))
        if body.headers is not None and len(body.headers) != len(columns):
            raise AppError(CommonErrorCodes.BAD_REQUEST, crud_text("export_headers"))
        # `before_list` hook'u liste gövdesini bekler; doğrulama zaten yapıldı.
        list_body: ListBody[TFilters] = ListBody.model_construct(
            filters=body.filters, sortBy=body.sortBy, sortOrder=body.sortOrder
        )
        query = self.scope(build_filter_query(body.filters, self.filter_fields))
        query = await self.hooks.before_list(query, list_body)
        sort = (
            resolve_sort(body.sortBy, body.sortOrder, self.sort_fields)
            or self.hooks.default_sort()
            or DEFAULT_SORT
        )
        total = await self.repository.count(query)
        if total > EXPORT_ROW_LIMIT:
            raise AppError(
                CommonErrorCodes.BAD_REQUEST,
                crud_text("export_too_many", total=total, limit=EXPORT_ROW_LIMIT),
            )
        skipped = (*self.hidden_fields, *(f for f in self.detail_only_fields if f not in columns))
        docs = await self.repository.find_page(
            query, sort, 0, max(total, 1), dict.fromkeys(skipped, 0) or None
        )
        rows = await self.hooks.map_rows([self.to_row(d) for d in await self.populate(docs)])
        wire = [r.model_dump(mode="json") for r in rows]
        return render_csv(wire, columns, body.headers or columns, self.export_display)

    async def get_by_id(self, id: str) -> TRow:
        doc = await self._find(id, read_query=True)
        rows = await self.hooks.map_rows([self.to_row(d) for d in await self.populate([doc])])
        return rows[0]

    async def create(self, body: TCreate) -> TRow:
        doc = to_storage(self.map_create(body))
        await self.check_relations(doc)
        await self.check_unique(doc, None)
        await self.hooks.before_create(doc, body)
        now = utc_now()
        doc["createdAt"] = now
        doc["updatedAt"] = now
        oid = await self._write(self.repository.insert(doc))
        row = await self._read_row(oid)
        await self.hooks.after_create(row)
        return row

    async def update(self, id: str, body: TUpdate) -> TRow:
        current = await self._find(id)
        changes = to_storage(self.map_update(body))
        await self.check_relations(changes)
        await self.check_unique(changes, current["_id"])
        await self.hooks.before_update(current, changes, body)
        if changes:
            changes["updatedAt"] = utc_now()
            await self._write(self.repository.update_by_id(current["_id"], changes))
        row = await self._read_row(current["_id"])
        await self.hooks.after_update(row)
        return row

    async def delete(self, id: str) -> None:
        current = await self._find(id)
        await self.hooks.before_delete(current)
        if not await self.repository.delete_by_id(current["_id"]):
            raise _not_found()  # arada başka bir istek sildi: `after_delete` bir kez çalışır
        await self.hooks.after_delete(self.to_row(current))

    # --- Yardımcılar -------------------------------------------------------------

    async def _find(self, id: str, *, read_query: bool = False) -> Doc:
        oid = parse_id(id)
        if oid is None:
            raise _not_found()
        query = self.scope({"_id": oid})
        if read_query:
            query = await self.hooks.before_get_by_id(query)
        doc = await self.repository.find_one(query, self.read_projection() if read_query else None)
        if doc is None:
            raise _not_found()
        return doc

    async def _read_row(self, oid: ObjectId) -> TRow:
        doc = await self.repository.find_one({"_id": oid}, self.read_projection())
        if doc is None:
            raise _not_found()
        return self.to_row(doc)

    async def _write[T](self, op: Awaitable[T]) -> T:
        """Kontrolden kaçan yarış: unique index ihlali → 409."""
        try:
            return await op
        except DuplicateKeyError as exc:
            field = next(iter((exc.details or {}).get("keyPattern", {}) or {}), "?")
            raise _conflict(field) from exc


def _not_found() -> AppError:
    return AppError(CommonErrorCodes.NOT_FOUND, crud_text("not_found"))


def _conflict(field: str) -> AppError:
    return AppError(CommonErrorCodes.CONFLICT, crud_text("duplicate", field=field))


__all__ = ["CrudService"]
