"""Üretilmiş `orders` modülü (regen-python, `fixtures/python/py6-kinds.models.json`): `access` (readonly,
hiddenFromCreate / Update, hidden, adminOnly), alt alanda decimal / reference / iç içe obje / json / map, opak obje,
decimal dizisi ve kısıtları, populate'te gizli alan yok (gerçek test Mongo'su)."""

from __future__ import annotations

from typing import Any

import pytest
from bson import Decimal128, ObjectId

BASE = "/api/v1/admin-crud"


@pytest.fixture
def h(make_token) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token('admin-1', role='admin')}"}


def _order(code: str, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"code": code, "total": "12.30", "raw": None, "secret": "s3cret"}
    body.update(overrides)
    return body


async def _create(client, h, resource: str, body: dict[str, Any]) -> dict[str, Any]:
    resp = await client.post(f"{BASE}/{resource}/create", json=body, headers=h)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _status(resp: Any, status: int) -> None:
    assert resp.status_code == status, resp.text
    assert resp.json()["errorData"]["code"] == status


async def test_access_flags(client, h, mock_db) -> None:
    row = await _create(client, h, "orders", _order("o1", lockedCode="L1"))
    assert "secret" not in row
    assert (row["status"], row["version"], row["vip"], row["lockedCode"], row["internalNote"]) == ("new", 0, False, "L1", None)
    stored = await mock_db["orders"].find_one({"_id": ObjectId(row["id"])})
    assert stored["secret"] == "s3cret"

    _status(await client.post(f"{BASE}/orders/create", json=_order("o2", status="paid"), headers=h), 400)  # readonly
    _status(await client.post(f"{BASE}/orders/create", json=_order("o2", version=3), headers=h), 400)  # readonly
    _status(await client.post(f"{BASE}/orders/create", json=_order("o2", internalNote="x"), headers=h), 400)  # hiddenFromCreate
    _status(await client.post(f"{BASE}/orders/create", json=_order("o2", secret=None), headers=h), 400)  # hidden, required
    _status(await client.post(f"{BASE}/orders/update/{row['id']}", json={"lockedCode": "L2"}, headers=h), 400)  # hiddenFromUpdate
    _status(await client.post(f"{BASE}/orders/update/{row['id']}", json={"status": "paid"}, headers=h), 400)

    upd = await client.post(f"{BASE}/orders/update/{row['id']}", json={"internalNote": "n", "vip": True, "secret": "new"}, headers=h)
    assert upd.status_code == 200, upd.text
    data = upd.json()["data"]
    assert (data["internalNote"], data["vip"], "secret" in data) == ("n", True, False)
    got = (await client.get(f"{BASE}/orders/{row['id']}", headers=h)).json()["data"]
    assert "secret" not in got
    page = (await client.post(f"{BASE}/orders/get-all", json={}, headers=h)).json()["data"]
    assert "secret" not in page["items"][0]
    _status(await client.post(f"{BASE}/orders/get-all", json={"filters": {"secret": "new"}}, headers=h), 400)
    _status(await client.post(f"{BASE}/orders/get-all", json={"sortBy": "secret"}, headers=h), 400)


async def test_nested_kinds(client, h, mock_db) -> None:
    doc = await _create(client, h, "documents", {"type": "kvkk", "title": "T", "content": "c"})
    line = {
        "sku": "A",
        "price": "1.10",
        "productId": doc["id"],
        "attrs": {"size": {"w": 1, "h": [2, 3]}},
        "extra": [1, "x", None],
        "flags": {"gift": True},
        "shippedAt": "2026-01-02T03:04:05Z",
    }
    row = await _create(
        client, h, "orders", _order("n1", lines=[line], payload={"a": {"b": 1}}, counters={"x": 1.5}, amounts=["1", "2.50"], raw=[1])
    )
    assert row["lines"] == [{**line, "shippedAt": "2026-01-02T03:04:05.000Z"}]
    assert (row["payload"], row["counters"], row["amounts"], row["raw"], row["fee"]) == ({"a": {"b": 1}}, {"x": 1.5}, ["1", "2.50"], [1], "0.50")
    stored = await mock_db["orders"].find_one({"_id": ObjectId(row["id"])})
    assert isinstance(stored["lines"][0]["productId"], ObjectId) and isinstance(stored["lines"][0]["price"], Decimal128)
    assert isinstance(stored["amounts"][1], Decimal128)

    _status(await client.post(f"{BASE}/orders/create", json=_order("n2", lines=[{**line, "productId": "bad"}]), headers=h), 400)
    _status(await client.post(f"{BASE}/orders/create", json=_order("n2", lines=[{**line, "flags": {"gift": "maybe"}}]), headers=h), 400)
    _status(await client.post(f"{BASE}/orders/create", json=_order("n2", payload=[1]), headers=h), 400)  # opaque object: JSON object
    _status(await client.post(f"{BASE}/orders/create", json=_order("n2", total="-1"), headers=h), 400)  # min 0
    _status(await client.post(f"{BASE}/orders/create", json=_order("n2", total="1000000.01"), headers=h), 400)  # max
    _status(await client.post(f"{BASE}/orders/create", json={"code": "n2", "total": "1", "secret": "s"}, headers=h), 400)  # raw required


async def test_populate_skips_hidden_target_fields(client, h) -> None:
    user = await _create(client, h, "users", {"email": "u@x.io", "password": "p", "name": "U"})
    assert "password" not in user
    note = await _create(client, h, "user-notes", {"userId": user["id"], "text": "hello"})
    row = await _create(client, h, "orders", _order("p1", customerId=user["id"], noteIds=[note["id"]]))
    assert (row["customerId"], row["noteIds"]) == (user["id"], [note["id"]])
    got = (await client.get(f"{BASE}/orders/{row['id']}", headers=h)).json()["data"]
    assert got["customerId"]["id"] == user["id"]
    assert set(got["customerId"]) == {"id", "email", "role", "createdAt"}  # `password` (hidden) never populated
    assert got["noteIds"] == [{"id": note["id"], "text": "hello"}]  # no `populate` list: `display`
    notes = (await client.get(f"{BASE}/user-notes/{note['id']}", headers=h)).json()["data"]
    assert set(notes["userId"]) == {"id", "name", "email"}
