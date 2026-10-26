"""core/crud: liste gövdesi, filtreler, sıralama, sayfalama, wire ve CrudService (gerçek test Mongo'su)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

import pytest
from bson import ObjectId
from pydantic import BaseModel, ConfigDict, ValidationError

from __app__.core.crud import (
    CrudRepository,
    CrudService,
    DateRangeValue,
    FilterField,
    IdStr,
    ListBody,
    NotNull,
    RangeValue,
    ServiceHooks,
    UtcDateTime,
    build_filter_query,
    to_wire,
)
from __app__.core.crud.pagination import page_window
from __app__.core.crud.sort import DEFAULT_SORT, resolve_sort
from __app__.core.crud.wire import format_utc
from __app__.core.errors.app_error import AppError


class Filters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: IdStr | None = None
    name: str | None = None
    score: RangeValue | None = None
    kind: str | list[str] | None = None
    active: bool | None = None
    createdAt: DateRangeValue | None = None


FIELDS = {
    "id": FilterField("_id", "id"),
    "name": FilterField("name", "regex"),
    "score": FilterField("score", "range"),
    "kind": FilterField("kind", "enum"),
    "active": FilterField("active", "boolean"),
    "createdAt": FilterField("createdAt", "date-range"),
}


def test_list_body_is_strict_and_page_starts_at_one() -> None:
    assert ListBody[Filters].model_validate({}).page is None
    with pytest.raises(ValidationError):
        ListBody[Filters].model_validate({"name": "x"})
    with pytest.raises(ValidationError):
        ListBody[Filters].model_validate({"filters": {"nope": 1}})
    with pytest.raises(ValidationError):
        ListBody[Filters].model_validate({"page": 0})
    with pytest.raises(ValidationError):
        ListBody[Filters].model_validate({"sortOrder": "up"})


def test_filter_query_per_kind() -> None:
    oid = ObjectId()
    filters = Filters.model_validate(
        {
            "id": str(oid),
            "name": "a.b",
            "score": {"min": 1},
            "kind": ["x", "y"],
            "active": False,
            "createdAt": {"from": "2026-01-02", "to": "2026-01-03"},
        }
    )
    query = build_filter_query(filters, FIELDS)
    assert query["_id"] == oid
    assert query["name"] == {"$regex": r"a\.b", "$options": "i"}
    assert query["score"] == {"$gte": 1}
    assert query["kind"] == {"$in": ["x", "y"]}
    assert query["active"] is False
    assert query["createdAt"] == {
        "$gte": datetime(2026, 1, 2, tzinfo=UTC),
        "$lt": datetime(2026, 1, 4, tzinfo=UTC),
    }


def test_filter_single_values() -> None:
    query = build_filter_query(Filters.model_validate({"score": 5, "kind": "x", "createdAt": "2026-01-02"}), FIELDS)
    assert query == {
        "score": 5,
        "kind": {"$in": ["x"]},
        "createdAt": {"$gte": datetime(2026, 1, 2, tzinfo=UTC), "$lt": datetime(2026, 1, 3, tzinfo=UTC)},
    }


def test_filter_rejects_bad_id_and_unknown_range_key() -> None:
    with pytest.raises(ValidationError):
        Filters.model_validate({"id": "not-an-id"})
    with pytest.raises(ValidationError):
        Filters.model_validate({"createdAt": {"since": "2026-01-01"}})


def test_sort_whitelist_and_tiebreak() -> None:
    fields = {"name": "name"}
    assert resolve_sort(None, None, fields) is None
    assert resolve_sort("name", "asc", fields) == [("name", 1), ("_id", 1)]
    assert resolve_sort("name", None, fields) == [("name", -1), ("_id", -1)]
    assert resolve_sort("id", "asc", fields) == [("_id", 1)]
    with pytest.raises(AppError) as exc:
        resolve_sort("nope", None, fields)
    assert exc.value.code == 400


def test_page_window_clamps_limit() -> None:
    assert page_window(None, None) == (1, 50, 0)
    assert page_window(3, 500) == (3, 100, 200)
    assert page_window(2, 0) == (2, 50, 50)


def test_wire_and_utc_format() -> None:
    oid = ObjectId()
    assert to_wire({"_id": oid, "refs": [oid], "nested": {"_id": oid}}) == {
        "id": str(oid),
        "refs": [str(oid)],
        "nested": {"id": str(oid)},
    }
    assert format_utc(datetime(2026, 1, 2, 3, 4, 5, 678901)) == "2026-01-02T03:04:05.678Z"


class Row(BaseModel):
    id: str
    name: str
    score: int
    note: str | None = None
    createdAt: UtcDateTime
    updatedAt: UtcDateTime


class Create(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    score: int = 0
    note: str | None = None


class Update(BaseModel):
    """JSON Merge Patch: `name` zorunlu (`null` 400), `score` / `note` opsiyonel (`null` temizler)."""

    model_config = ConfigDict(extra="forbid")

    name: NotNull[str] = None
    score: int | None = None
    note: str | None = None


class Repo(CrudRepository):
    collection_name = "things"


class Hooks(ServiceHooks[Filters, Create, Update, Row]):
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def before_create(self, doc, body) -> None:
        self.calls.append("before_create")
        if body.name == "blocked":
            raise AppError(422, "blocked")

    async def after_create(self, row: Row) -> None:
        self.calls.append(f"after_create:{row.name}")

    async def before_delete(self, current) -> None:
        self.calls.append("before_delete")

    async def after_delete(self, row: Row) -> None:
        self.calls.append(f"after_delete:{row.name}")

    async def map_rows(self, rows: list[Row]) -> list[Row]:
        self.calls.append(f"map_rows:{len(rows)}")
        return rows


class Service(CrudService[Filters, Create, Update, Row]):
    row_model = Row
    filter_fields: ClassVar = FIELDS
    sort_fields: ClassVar = {"name": "name", "score": "score", "createdAt": "createdAt"}
    unique_fields = ("name",)


@pytest.fixture
def service(mongo_client) -> Service:
    db = mongo_client["crud_test"]
    return Service(Repo(db), Hooks())


async def test_crud_flow_with_hooks(service: Service) -> None:
    hooks = service.hooks
    assert isinstance(hooks, Hooks)
    a = await service.create(Create(name="alpha", score=2))
    b = await service.create(Create(name="beta", score=1))
    assert hooks.calls[:2] == ["before_create", "after_create:alpha"]
    assert a.createdAt.microsecond % 1000 == 0

    page = await service.list(ListBody[Filters]())
    assert [r.name for r in page.items] == ["beta", "alpha"]
    assert (page.total, page.hasMore, page.currentPage, page.currentLimit) == (2, False, 1, 50)

    page = await service.list(ListBody[Filters](sortBy="score", sortOrder="asc", limit=1, page=2))
    assert [r.name for r in page.items] == ["alpha"]
    assert page.hasMore is False

    filtered = await service.list(ListBody[Filters](filters=Filters(name="ALP")))
    assert [r.name for r in filtered.items] == ["alpha"]

    updated = await service.update(a.id, Update(score=9))
    assert (updated.name, updated.score) == ("alpha", 9)
    assert updated.updatedAt >= a.updatedAt

    with pytest.raises(AppError) as conflict:
        await service.update(b.id, Update(name="alpha"))
    assert conflict.value.code == 409

    await service.delete(b.id)
    assert hooks.calls[-2:] == ["before_delete", "after_delete:beta"]
    with pytest.raises(AppError) as missing:
        await service.get_by_id(b.id)
    assert missing.value.code == 404


async def test_update_null_rule(service: Service) -> None:
    """Gönderilmeyen alan değişmez, opsiyonel alana `null` temizler (`$unset`), zorunlu alana `null` 400."""
    a = await service.create(Create(name="alpha", score=2, note="n"))
    kept = await service.update(a.id, Update.model_validate({"score": 3}))
    assert (kept.name, kept.score, kept.note) == ("alpha", 3, "n")

    cleared = await service.update(a.id, Update.model_validate({"note": None}))
    assert (cleared.name, cleared.score, cleared.note) == ("alpha", 3, None)
    doc = await service.repository.find_one({"_id": ObjectId(a.id)})
    assert doc is not None
    assert "note" not in doc

    with pytest.raises(ValidationError):
        Update.model_validate({"name": None})
    assert Update.model_validate({}).model_fields_set == set()


async def test_create_conflict_and_hook_stop(service: Service) -> None:
    await service.create(Create(name="alpha"))
    with pytest.raises(AppError) as conflict:
        await service.create(Create(name="alpha"))
    assert conflict.value.code == 409
    with pytest.raises(AppError) as stopped:
        await service.create(Create(name="blocked"))
    assert stopped.value.code == 422
    assert (await service.list(ListBody[Filters]())).total == 1


async def test_delete_race_is_404_without_after_delete(service: Service) -> None:
    """Kayıt `before_delete` ile silme arasında başka bir istekle silinirse 404; `after_delete` çalışmaz."""
    row = await service.create(Create(name="gone"))
    hooks = service.hooks
    assert isinstance(hooks, Hooks)
    original = hooks.before_delete

    async def delete_meanwhile(current) -> None:
        await original(current)
        await service.repository.delete_by_id(current["_id"])

    hooks.before_delete = delete_meanwhile  # type: ignore[method-assign]
    with pytest.raises(AppError) as exc:
        await service.delete(row.id)
    assert exc.value.code == 404
    assert not any(c.startswith("after_delete") for c in hooks.calls)


async def test_malformed_and_missing_ids_are_404(service: Service) -> None:
    for bad in ("not-an-id", str(ObjectId())):
        with pytest.raises(AppError) as exc:
            await service.get_by_id(bad)
        assert exc.value.code == 404


def test_default_sort() -> None:
    assert DEFAULT_SORT == [("createdAt", -1), ("_id", -1)]
