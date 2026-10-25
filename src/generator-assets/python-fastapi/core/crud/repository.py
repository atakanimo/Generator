"""CRUD tabanı için Mongo erişimi. Modülün `repository_generated.py`'si collection adını ve index'leri verir."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, ClassVar

if TYPE_CHECKING:
    from bson import ObjectId

    from ..db import Database
    from .hooks import Doc
    from .sort import SortSpec


class CrudRepository:
    collection_name: ClassVar[str]

    def __init__(self, db: Database) -> None:
        self._db = db
        self._c = db[self.collection_name]

    @property
    def collection(self) -> Any:
        return self._c

    async def count(self, query: Doc) -> int:
        return int(await self._c.count_documents(query))

    async def find_page(
        self, query: Doc, sort: SortSpec, skip: int, limit: int, projection: Doc | None = None
    ) -> list[Doc]:
        cursor = self._c.find(query, projection).sort(sort).skip(skip).limit(limit)
        return await cursor.to_list(length=limit)

    async def find_one(self, query: Doc, projection: Doc | None = None) -> Doc | None:
        return await self._c.find_one(query, projection)

    async def exists(self, query: Doc) -> bool:
        return await self._c.find_one(query, {"_id": 1}) is not None

    async def insert(self, doc: Doc) -> ObjectId:
        result = await self._c.insert_one(doc)
        return result.inserted_id

    async def update_by_id(self, oid: ObjectId, changes: Doc) -> None:
        """`None` değer alanı siler (`$unset`, api-contract §5); diğerleri `$set`."""
        update: Doc = {}
        if values := {k: v for k, v in changes.items() if v is not None}:
            update["$set"] = values
        if unset := dict.fromkeys((k for k, v in changes.items() if v is None), ""):
            update["$unset"] = unset
        if update:
            await self._c.update_one({"_id": oid}, update)

    async def delete_by_id(self, oid: ObjectId) -> bool:
        result = await self._c.delete_one({"_id": oid})
        return result.deleted_count == 1

    async def count_ids(self, collection: str, ids: list[Any]) -> int:
        """`reference` kontrolü: başka bir collection'da bu id'lerden kaç kayıt var."""
        return int(await self._db[collection].count_documents({"_id": {"$in": ids}}))

    async def find_ids(self, collection: str, ids: list[Any], fields: tuple[str, ...]) -> list[Doc]:
        """Populate: başka bir collection'dan id'leri verilen kayıtların yalnızca `fields` alanları (+ `_id`)."""
        cursor = self._db[collection].find({"_id": {"$in": ids}}, {"_id": 1, **dict.fromkeys(fields, 1)})
        return await cursor.to_list(length=len(ids))

    async def ensure_indexes(self) -> None:
        await self._c.create_index([("createdAt", -1)], name="idx_created_at")


__all__ = ["CrudRepository"]
