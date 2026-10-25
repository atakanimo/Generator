"""`AdminDep` / `DbDep`: JWT (`sub` + `role`), 401 / 403 sözleşme zarfı, veritabanı bağımlılığı."""

from __future__ import annotations

import pytest
from fastapi import APIRouter

from __app__.api.deps import AdminDep, DbDep
from __app__.core.http.contract import ContractResponse, ContractRoute, contract_ok

probe = APIRouter(prefix="/probe", route_class=ContractRoute)


@probe.get("/admin", response_model=ContractResponse[dict[str, str]])
async def admin_probe(user: AdminDep, db: DbDep) -> ContractResponse[dict[str, str]]:
    return contract_ok({"id": user.id, "db": db.name})


@pytest.fixture
def app(app):
    app.include_router(probe, prefix="/api/v1")
    return app


def _code(resp, status: int) -> None:
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert body["isSuccess"] is False
    assert body["errorData"]["code"] == status


async def test_admin_dep(client, make_token) -> None:
    url = "/api/v1/probe/admin"
    _code(await client.get(url), 401)
    _code(await client.get(url, headers={"Authorization": "Bearer nope"}), 401)
    expired = make_token("u1", role="admin", expires_in=-60)
    _code(await client.get(url, headers={"Authorization": f"Bearer {expired}"}), 401)
    _code(await client.get(url, headers={"Authorization": f"Bearer {make_token('u1', role='user')}"}), 403)
    _code(await client.get(url, headers={"Authorization": f"Bearer {make_token('u1')}"}), 403)

    for role in ("admin", ["user", "admin"]):
        resp = await client.get(url, headers={"Authorization": f"Bearer {make_token('u1', role=role)}"})
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"] == {"id": "u1", "db": "__app___test"}
