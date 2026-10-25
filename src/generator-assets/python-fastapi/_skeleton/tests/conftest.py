"""Ortak fixture'lar: sahte Mongo (mongomock-motor), in-process HTTP istemcisi, JWT üretici.

Testler gerçek Mongo'ya bağlanmaz: varsayılan `MONGO_URI` erişilemeyen porta gider, lifespan'ın bağlantısı sahte DB'ye
yönlendirilir. Uygulama modülleri ayarlar ortamdan okunduktan sonra import edilsin diye fixture'ların içinde import edilir.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("MONGO_URI", "mongodb://127.0.0.1:9")
os.environ.setdefault("MONGO_CONNECT_TIMEOUT_MS", "200")
os.environ.setdefault("MONGO_SERVER_SELECTION_TIMEOUT_MS", "200")
os.environ.setdefault("MONGO_DB_NAME", "__app___test")
os.environ.setdefault("JWT_SECRET", "test-secret-0123456789abcdef0123456789abcdef")

if TYPE_CHECKING:
    from collections.abc import AsyncIterator, Callable

    from fastapi import FastAPI
    from httpx import AsyncClient


@pytest.fixture
def mock_db(monkeypatch: pytest.MonkeyPatch):
    """Lifespan `connect_to_mongo` / `close_mongo_connection`'ı sahte DB'ye bağlar."""
    from mongomock_motor import AsyncMongoMockClient

    import __app__.api.main as main_module
    import __app__.core.db as db_module

    client = AsyncMongoMockClient()
    db = client["__app___test"]

    async def fake_connect() -> None:
        db_module._state.client = client
        db_module._state.db = db
        db_module._state.is_connected = True

    async def fake_close() -> None:
        db_module._state.client = None
        db_module._state.db = None
        db_module._state.is_connected = False

    monkeypatch.setattr(main_module, "connect_to_mongo", fake_connect)
    monkeypatch.setattr(main_module, "close_mongo_connection", fake_close)
    yield db
    db_module._state.client, db_module._state.db, db_module._state.is_connected = None, None, False


@pytest.fixture
def app(mock_db) -> FastAPI:
    from __app__.api.main import create_app

    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac, app.router.lifespan_context(app):
        yield ac


@pytest.fixture
def api_prefix() -> str:
    from __app__.core.config import settings

    return settings.API_PREFIX


@pytest.fixture
def make_token() -> Callable[..., str]:
    """`make_token("user-1", role="admin")`; `expires_in` negatifse süresi geçmiş token."""
    import jwt

    from __app__.core.config import settings

    def _make(sub: str, *, role: str | list[str] | None = None, expires_in: int = 3600) -> str:
        claims: dict[str, object] = {"sub": sub, "exp": datetime.now(UTC) + timedelta(seconds=expires_in)}
        if role is not None:
            claims["role"] = role
        return jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    return _make
