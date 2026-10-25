"""`reference` alanları (api-contract §4, §5): yazmada hedef kaydın varlık kontrolü, okumada populate.

- Kontrol: create / update'te verilen id'lerin hepsi hedef collection'da olmalı, yoksa 400 (.NET `CheckRelationsAsync`
  ile aynı kod ve metin). Dizide tekrar eden id bir kez saklanır (.NET çoka çok ile aynı).
- Populate: yalnızca okuma uçlarında (list, getOne); create / update cevabında ilişki id olarak kalır. Sayfanın bütün
  satırları için alan başına tek `$in` sorgusu (N+1 yok). Hedef silinmişse tekil alan `null`, dizide eleman düşer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from ..errors.app_error import AppError
from ..errors.common_codes import CommonErrorCodes
from .messages import crud_text

if TYPE_CHECKING:
    from .hooks import Doc
    from .repository import CrudRepository


@dataclass(frozen=True)
class RelationField:
    """Hedefi bu host'ta üretilen `reference` alanı: Mongo alan yolu → hedef collection."""

    path: str
    collection: str
    many: bool = False


@dataclass(frozen=True)
class PopulateField:
    """Okumada doldurulan `reference` alanı: hedeften okunacak alanlar (`_id` her zaman gelir, gizli alanlar yok)."""

    path: str
    collection: str
    fields: tuple[str, ...]
    many: bool = False


def _ids(value: Any) -> list[Any]:
    if value is None:
        return []
    return [v for v in value if v is not None] if isinstance(value, list) else [value]


async def check_relations(repository: CrudRepository, fields: tuple[RelationField, ...], doc: Doc) -> None:
    for field in fields:
        if field.path not in doc:
            continue
        if field.many and isinstance(doc[field.path], list):
            doc[field.path] = list(dict.fromkeys(doc[field.path]))
        ids = list(dict.fromkeys(_ids(doc[field.path])))
        if ids and await repository.count_ids(field.collection, ids) != len(ids):
            raise AppError(CommonErrorCodes.BAD_REQUEST, crud_text("reference_not_found", field=field.path))


async def populate_docs(
    repository: CrudRepository, fields: tuple[PopulateField, ...], docs: list[Doc]
) -> list[Doc]:
    for field in fields:
        ids = list(dict.fromkeys(i for d in docs for i in _ids(d.get(field.path))))
        if not ids:
            continue
        found = {t["_id"]: t for t in await repository.find_ids(field.collection, ids, field.fields)}
        for doc in docs:
            value = doc.get(field.path)
            if isinstance(value, list):
                doc[field.path] = [found[v] for v in value if v in found]
            elif value is not None:
                doc[field.path] = found.get(value)
    return docs


__all__ = ["PopulateField", "RelationField", "check_relations", "populate_docs"]
