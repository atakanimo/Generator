"""Sağlık ucu: sözleşme zarfı (api-contract §1) ve `traceId` / `X-Request-Id` (K4)."""

from __future__ import annotations

ENVELOPE_KEYS = {"isSuccess", "data", "uiMessage", "errorData", "traceId"}


async def test_health_envelope(client, api_prefix: str) -> None:
    resp = await client.get(f"{api_prefix}/health")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == ENVELOPE_KEYS
    assert body["isSuccess"] is True
    assert body["errorData"] is None
    assert body["data"] == {"status": "ok", "environment": "test", "mongoConnected": True}
    assert body["traceId"] and resp.headers["X-Request-Id"] == body["traceId"]


async def test_trace_id_headers(client, api_prefix: str) -> None:
    resp = await client.get(f"{api_prefix}/health", headers={"X-Request-Id": "trace-1"})
    assert resp.json()["traceId"] == "trace-1"
    assert resp.headers["X-Request-Id"] == "trace-1"
    assert resp.headers["X-Trace-Id"] == "trace-1"

    legacy = await client.get(f"{api_prefix}/health", headers={"X-Trace-Id": "trace-2"})
    assert legacy.json()["traceId"] == "trace-2"

    too_long = await client.get(f"{api_prefix}/health", headers={"X-Request-Id": "x" * 200})
    assert too_long.json()["traceId"] not in ("", "x" * 200)


async def test_turkish_ui_message(client, api_prefix: str) -> None:
    tr = (await client.get(f"{api_prefix}/health", headers={"Accept-Language": "tr-TR,tr;q=0.9"})).json()
    en = (await client.get(f"{api_prefix}/health")).json()
    assert tr["uiMessage"] and en["uiMessage"] and tr["uiMessage"] != en["uiMessage"]


async def test_language_comes_only_from_accept_language(client, api_prefix: str) -> None:
    default = (await client.get(f"{api_prefix}/health")).json()["uiMessage"]
    for headers in ({"lang": "tr"}, {"x-lang": "tr"}, {"Accept-Language": "de-DE"}):
        assert (await client.get(f"{api_prefix}/health", headers=headers)).json()["uiMessage"] == default


async def test_errors_outside_routes_use_the_envelope(client, api_prefix: str) -> None:
    missing = await client.get(f"{api_prefix}/nope", headers={"X-Request-Id": "trace-404"})
    assert missing.status_code == 404
    body = missing.json()
    assert set(body) == ENVELOPE_KEYS
    assert body["isSuccess"] is False and body["errorData"]["code"] == 404 and body["traceId"] == "trace-404"

    wrong_method = await client.post(f"{api_prefix}/health", headers={"Accept-Language": "tr"})
    assert wrong_method.status_code == 405
    err = wrong_method.json()["errorData"]
    assert err["code"] == 405 and err["message"] == "Bu uç bu yöntemi desteklemiyor."
