"""Üretilmiş `templates` modülü (regen-python, golden `fixtures/dotnet/models.json`): `reference` (tekil, dizi, hedefsiz
dizi), ilişki kontrolü (400), populate (list / getOne obje, create / update id), reference filtresi (gerçek test Mongo'su)."""

from __future__ import annotations

from typing import Any

import pytest
from bson import ObjectId

BASE = "/api/v1/admin-crud"


@pytest.fixture
def h(make_token) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token('admin-1', role='admin')}"}


async def _create(client, h, resource: str, body: dict[str, Any]) -> dict[str, Any]:
    resp = await client.post(f"{BASE}/{resource}/create", json=body, headers=h)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _status(resp: Any, status: int) -> None:
    assert resp.status_code == status, resp.text
    assert resp.json()["errorData"]["code"] == status


async def _setup(client, h) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    et = await _create(client, h, "event-types", {"name": "Wedding"})
    doc = await _create(client, h, "documents", {"type": "kvkk", "title": "KVKK", "content": "c"})
    plan = await _create(client, h, "membership-plans", {"code": "p1", "price": "10", "limits": {"watermark": True}})
    return et, doc, plan


async def test_reference_ids_on_write_objects_on_read(client, h, mock_db) -> None:
    et, doc, plan = await _setup(client, h)
    external = str(ObjectId())
    body = {"name": "T1", "eventTypeId": et["id"], "planId": plan["id"], "documentIds": [doc["id"], doc["id"]], "externalIds": [external]}
    row = await _create(client, h, "templates", body)
    # create response: relations as ids; m-n duplicates dropped (.NET join table); target-less list kept as given
    assert (row["eventTypeId"], row["planId"], row["documentIds"], row["externalIds"]) == (et["id"], plan["id"], [doc["id"]], [external])
    stored = await mock_db["templates"].find_one({"_id": ObjectId(row["id"])})
    assert isinstance(stored["eventTypeId"], ObjectId) and isinstance(stored["documentIds"][0], ObjectId)

    got = (await client.get(f"{BASE}/templates/{row['id']}", headers=h)).json()["data"]
    assert got["eventTypeId"] == {"id": et["id"], "name": "Wedding", "isActive": True}
    assert got["documentIds"] == [{"id": doc["id"], "title": "KVKK", "type": "kvkk"}]
    assert got["planId"] == plan["id"]  # include: false → id

    page = (await client.post(f"{BASE}/templates/get-all", json={}, headers=h)).json()["data"]
    assert page["items"][0]["eventTypeId"]["name"] == "Wedding"

    upd = await client.post(f"{BASE}/templates/update/{row['id']}", json={"documentIds": []}, headers=h)
    assert upd.status_code == 200, upd.text
    assert (upd.json()["data"]["documentIds"], upd.json()["data"]["eventTypeId"]) == ([], et["id"])


async def test_relation_check(client, h) -> None:
    et, doc, _ = await _setup(client, h)
    missing = str(ObjectId())
    _status(await client.post(f"{BASE}/templates/create", json={"name": "x", "eventTypeId": missing}, headers=h), 400)
    _status(await client.post(f"{BASE}/templates/create", json={"name": "x", "eventTypeId": et["id"], "documentIds": [missing]}, headers=h), 400)
    _status(await client.post(f"{BASE}/templates/create", json={"name": "x", "eventTypeId": "not-an-id"}, headers=h), 400)
    _status(await client.post(f"{BASE}/templates/create", json={"name": "x", "eventTypeId": {"id": et["id"]}}, headers=h), 400)
    # target-less reference list: no check
    row = await _create(client, h, "templates", {"name": "y", "eventTypeId": et["id"], "externalIds": [missing]})
    _status(await client.post(f"{BASE}/templates/update/{row['id']}", json={"planId": missing}, headers=h), 400)
    resp = await client.post(f"{BASE}/templates/update/{row['id']}", json={"documentIds": [doc["id"]]}, headers=h)
    assert resp.status_code == 200, resp.text


async def test_reference_filters_and_missing_target(client, h, mock_db) -> None:
    et, doc, _ = await _setup(client, h)
    other = await _create(client, h, "event-types", {"name": "Party"})
    a = await _create(client, h, "templates", {"name": "A", "eventTypeId": et["id"], "documentIds": [doc["id"]]})
    await _create(client, h, "templates", {"name": "B", "eventTypeId": other["id"]})

    async def names(filters: dict[str, Any]) -> list[str]:
        resp = await client.post(f"{BASE}/templates/get-all", json={"filters": filters, "sortBy": "name", "sortOrder": "asc"}, headers=h)
        assert resp.status_code == 200, resp.text
        return [i["name"] for i in resp.json()["data"]["items"]]

    assert await names({"eventTypeId": et["id"]}) == ["A"]
    assert await names({"eventTypeId": [et["id"], other["id"]]}) == ["A", "B"]
    assert await names({"documentIds": doc["id"]}) == ["A"]
    _status(await client.post(f"{BASE}/templates/get-all", json={"filters": {"eventTypeId": "bad"}}, headers=h), 400)
    _status(await client.post(f"{BASE}/templates/get-all", json={"filters": {"externalIds": doc["id"]}}, headers=h), 400)

    # deleted target (no FK in Mongo): single → null, list → element dropped
    await mock_db["event_types"].delete_one({"_id": ObjectId(et["id"])})
    await mock_db["documents"].delete_one({"_id": ObjectId(doc["id"])})
    got = (await client.get(f"{BASE}/templates/{a['id']}", headers=h)).json()["data"]
    assert (got["eventTypeId"], got["documentIds"]) == (None, [])
