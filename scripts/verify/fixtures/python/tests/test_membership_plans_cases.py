"""Üretilmiş `membership_plans` modülü (regen-python, golden `fixtures/dotnet/models.json`): `decimal` (JSON string,
Mongo `Decimal128`, sayı → 400, filtre değeri string), `map`, `json`, obje / obje dizisi içinde decimal (gerçek test Mongo'su)."""

from __future__ import annotations

from typing import Any

import pytest
from bson import Decimal128, ObjectId

BASE = "/api/v1/admin-crud/membership-plans"


@pytest.fixture
def h(make_token) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token('admin-1', role='admin')}"}


def _plan(code: str, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"code": code, "price": "149.90", "limits": {"maxEvents": 5, "watermark": False}}
    body.update(overrides)
    return body


async def _create(client, h, body: dict[str, Any]) -> dict[str, Any]:
    resp = await client.post(f"{BASE}/create", json=body, headers=h)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _status(resp: Any, status: int) -> None:
    assert resp.status_code == status, resp.text
    assert resp.json()["errorData"]["code"] == status


async def test_decimal_map_json_round_trip(client, h, mock_db) -> None:
    row = await _create(
        client,
        h,
        _plan(
            "p1",
            features={"qr": True, "video": False},
            meta={"color": "red", "n": [1, 2], "deep": {"x": None}},
            tiers=[{"name": "a", "price": "10.5"}],
            tags=["x"],
        ),
    )
    assert (row["price"], row["discount"]) == ("149.90", "0")
    assert row["features"] == {"qr": True, "video": False}
    assert row["meta"] == {"color": "red", "n": [1, 2], "deep": {"x": None}}
    assert row["tiers"] == [{"name": "a", "price": "10.5"}]
    stored = await mock_db["membership_plans"].find_one({"_id": ObjectId(row["id"])})
    assert isinstance(stored["price"], Decimal128) and isinstance(stored["tiers"][0]["price"], Decimal128)
    assert str(stored["price"]) == "149.90"

    got = (await client.get(f"{BASE}/{row['id']}", headers=h)).json()["data"]
    assert got == row

    upd = await client.post(f"{BASE}/update/{row['id']}", json={"discount": "1000", "meta": [1, "a"], "features": {"qr": False}}, headers=h)
    assert upd.status_code == 200, upd.text
    data = upd.json()["data"]
    assert (data["discount"], data["meta"], data["features"], data["price"]) == ("1000", [1, "a"], {"qr": False}, "149.90")


async def test_decimal_validation(client, h) -> None:
    _status(await client.post(f"{BASE}/create", json=_plan("q", price=1), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_plan("q", price=1.5), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_plan("q", price="abc"), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_plan("q", price="1e3"), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_plan("q", tiers=[{"name": "a", "price": 2}]), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_plan("q", features={"qr": "maybe"}), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_plan("q", limits={"watermark": True, "nope": 1}), headers=h), 400)


async def test_decimal_filters(client, h) -> None:
    await _create(client, h, _plan("a", price="9.99"))
    await _create(client, h, _plan("b", price="100"))
    await _create(client, h, _plan("c", price="250.5"))

    async def codes(body: dict[str, Any]) -> list[str]:
        resp = await client.post(f"{BASE}/get-all", json=body, headers=h)
        assert resp.status_code == 200, resp.text
        return [i["code"] for i in resp.json()["data"]["items"]]

    # Real test Mongo (PY2c): `Decimal128` range and sort run here too.
    assert await codes({"filters": {"price": "9.99"}}) == ["a"]
    assert await codes({"filters": {"price": {"min": "50", "max": "200"}}}) == ["b"]
    assert await codes({"sortBy": "price", "sortOrder": "asc"}) == ["a", "b", "c"]
    _status(await client.post(f"{BASE}/get-all", json={"filters": {"price": {"min": 50}}}, headers=h), 400)
