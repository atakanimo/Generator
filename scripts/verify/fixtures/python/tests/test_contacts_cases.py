"""Üretilmiş `contacts` modülü (regen-python): PY5 alan türleri (int / float, numeric enum, enum dizisi, e-posta + desen,
sadece tarih, opsiyonel unique, obje ve obje dizisi), filtreler ve sıralama (gerçek test Mongo'su)."""

from __future__ import annotations

from typing import Any

import pytest

BASE = "/api/v1/admin-crud/contacts"


@pytest.fixture
def h(make_token) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token('admin-1', role='admin')}"}


def _contact(email: str, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {"email": email, "fullName": f"Name {email}"}
    body.update(overrides)
    return body


async def _create(client, h, body: dict[str, Any]) -> dict[str, Any]:
    resp = await client.post(f"{BASE}/create", json=body, headers=h)
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _status(resp: Any, status: int) -> None:
    assert resp.status_code == status, resp.text
    assert resp.json()["errorData"]["code"] == status


async def test_kinds_defaults_and_round_trip(client, h) -> None:
    row = await _create(
        client,
        h,
        _contact(
            " a@x.io ",
            age=30,
            level=20,
            status="on-hold",
            roles=["owner"],
            tags=["t1"],
            birthday="1990-05-17",
            lastSeenAt="2026-01-02T03:04:05.678Z",
            address={"street": "Main 1", "zip": 34000, "verifiedAt": "2026-01-01T00:00:00Z"},
            phones=[{"number": "555", "primary": True}],
        ),
    )
    assert row["email"] == "a@x.io"
    assert (row["level"], row["status"], row["roles"], row["tags"]) == (20, "on-hold", ["owner"], ["t1"])
    assert (row["score"], row["isVip"], row["nickname"], row["workEmail"]) == (0, False, None, None)
    assert row["birthday"] == "1990-05-17"
    assert row["lastSeenAt"] == "2026-01-02T03:04:05.678Z"
    assert row["address"] == {"street": "Main 1", "zip": 34000, "verifiedAt": "2026-01-01T00:00:00.000Z"}
    assert row["phones"] == [{"number": "555", "primary": True}]

    bare = await _create(client, h, _contact("b@x.io"))
    assert (bare["level"], bare["roles"], bare["phones"], bare["address"], bare["birthday"]) == (10, [], [], None, None)

    got = (await client.get(f"{BASE}/{row['id']}", headers=h)).json()["data"]
    assert got == row

    upd = await client.post(f"{BASE}/update/{row['id']}", json={"level": 30, "roles": ["viewer"], "birthday": "1991-01-01"}, headers=h)
    assert upd.status_code == 200, upd.text
    data = upd.json()["data"]
    assert (data["level"], data["roles"], data["birthday"], data["age"]) == (30, ["viewer"], "1991-01-01", 30)


async def test_validation(client, h) -> None:
    _status(await client.post(f"{BASE}/create", json=_contact("not-an-email"), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", fullName="A"), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", age=151), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", age=1.5), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", level=15), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", roles=["admin"]), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", workEmail="x@other.com"), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", workEmail="bad@example.com.tr"), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", workEmail="no-at.example.com"), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", nickname="n" * 21), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", address={"zip": 1}), headers=h), 400)
    _status(await client.post(f"{BASE}/create", json=_contact("c@x.io", birthday="1990-05-17T10:00:00Z"), headers=h), 400)
    ok = await _create(client, h, _contact("c@x.io", workEmail="me@example.com"))
    assert ok["workEmail"] == "me@example.com"


async def test_unique_required_and_optional(client, h) -> None:
    await _create(client, h, _contact("u1@x.io"))
    await _create(client, h, _contact("u2@x.io"))  # nickname empty twice: no conflict
    _status(await client.post(f"{BASE}/create", json=_contact("u1@x.io"), headers=h), 409)
    first = await _create(client, h, _contact("u3@x.io", nickname="nick"))
    _status(await client.post(f"{BASE}/create", json=_contact("u4@x.io", nickname="nick"), headers=h), 409)
    other = await _create(client, h, _contact("u5@x.io"))
    _status(await client.post(f"{BASE}/update/{other['id']}", json={"nickname": "nick"}, headers=h), 409)
    same = await client.post(f"{BASE}/update/{first['id']}", json={"nickname": "nick"}, headers=h)
    assert same.status_code == 200, same.text


async def test_filters_and_sort(client, h) -> None:
    await _create(client, h, _contact("f1@x.io", age=20, score=1.5, level=10, status="active", birthday="2000-01-10", isVip=True))
    await _create(client, h, _contact("f2@x.io", age=40, score=3, level=30, birthday="2000-02-10"))
    await _create(client, h, _contact("f3@x.io", age=60, level=20, status="on-hold"))

    async def emails(body: dict[str, Any]) -> list[str]:
        resp = await client.post(f"{BASE}/get-all", json=body, headers=h)
        assert resp.status_code == 200, resp.text
        return [i["email"] for i in resp.json()["data"]["items"]]

    assert await emails({"filters": {"email": "f2@x.io"}}) == ["f2@x.io"]
    assert await emails({"filters": {"email": "f2"}}) == []  # eq, not regex
    assert await emails({"filters": {"fullName": "NAME F1"}}) == ["f1@x.io"]
    assert await emails({"filters": {"age": {"min": 30, "max": 50}}}) == ["f2@x.io"]
    assert await emails({"filters": {"score": {"min": 1}}, "sortBy": "score", "sortOrder": "asc"}) == ["f1@x.io", "f2@x.io"]
    assert await emails({"filters": {"level": [10, 20]}, "sortBy": "level", "sortOrder": "asc"}) == ["f1@x.io", "f3@x.io"]
    assert await emails({"filters": {"status": "on-hold"}}) == ["f3@x.io"]
    assert await emails({"filters": {"isVip": True}}) == ["f1@x.io"]
    assert await emails({"filters": {"birthday": {"from": "2000-02-01", "to": "2000-02-28"}}}) == ["f2@x.io"]
    assert await emails({"sortBy": "birthday", "sortOrder": "desc", "limit": 2}) == ["f2@x.io", "f1@x.io"]
    resp = await client.post(f"{BASE}/get-all", json={"filters": {"notes": "x"}}, headers=h)
    _status(resp, 400)  # `searchable: false`
