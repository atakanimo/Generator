"""Ortak fixture'lar: gerçek test Mongo'su (PyMongo Async), in-process HTTP istemcisi, JWT üretici.

Test Mongo'su: `TEST_MONGO_URI` varsa o, yoksa testcontainers ile geçici `mongo:7` (Docker gerekir; oturum sonunda
kapanır). `TestMongoClient` açtığı her veritabanına `__app___test_` önekini koyar (uygulamanın asıl veritabanına
yazılamaz); kullanılan veritabanları her testten sonra silinir. Varsayılan `MONGO_URI` erişilemeyen porta gider,
lifespan'ın bağlantısı test veritabanına yönlendirilir. Uygulama modülleri ayarlar ortamdan okunduktan sonra
import edilsin diye fixture'ların içinde import edilir.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any

import pytest
from pymongo import AsyncMongoClient, MongoClient

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


TEST_DB_PREFIX = "__app___test_"
_FORBIDDEN = {"admin", "local", "config"}

_uri: str | None = None
_container: Any = None
_used: set[str] = set()


def start_server() -> str:
    """Oturum başında bir kez çağrılır (`_test_mongo_server`); test Mongo URI'sini döner."""
    global _uri, _container
    if _uri is not None:
        return _uri
    env_uri = os.environ.get("TEST_MONGO_URI")
    if env_uri:
        _uri = env_uri
    else:
        from testcontainers.community.mongodb import MongoDbContainer

        # Kimlik bilgisi testcontainers'ın geçici varsayılanıdır; yerel `.env` okunmaz.
        _container = MongoDbContainer("mongo:7")
        _container.start()
        _uri = _container.get_connection_url()
    return _uri


def stop_server() -> None:
    global _container, _uri
    if _container is not None:
        _container.stop()
    _container = None
    _uri = None


def test_db_name(name: str) -> str:
    if name in _FORBIDDEN:
        name = f"x_{name}"
    full = name if name.startswith(TEST_DB_PREFIX.rstrip("_")) else f"{TEST_DB_PREFIX}{name}"
    _used.add(full)
    return full


class TestMongoClient(AsyncMongoClient):
    """`AsyncMongoClient`; veritabanı adları `__app___test_` önekli (ana DB'ye yazım imkânsız)."""

    __test__ = False  # pytest bunu test sınıfı sanmasın

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("uuidRepresentation", "standard")
        super().__init__(start_server(), **kwargs)

    def __getitem__(self, name: str) -> Any:
        return super().__getitem__(test_db_name(name))

    def __getattr__(self, name: str) -> Any:
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]

    def get_database(self, name: str | None = None, *args: Any, **kwargs: Any) -> Any:
        return super().get_database(test_db_name(name or "default"), *args, **kwargs)

    def get_default_database(self, *args: Any, **kwargs: Any) -> Any:
        return self.get_database("default", **kwargs)


def drop_test_databases() -> None:
    """Bu testin açtığı `__app___test_*` veritabanlarını siler (senkron istemci; event loop'tan bağımsız)."""
    if not _used or _uri is None:
        return
    with MongoClient(_uri) as sync_client:
        for name in list(_used):
            if name.startswith(TEST_DB_PREFIX.rstrip("_")):
                sync_client.drop_database(name)
    _used.clear()


@pytest.fixture(scope="session", autouse=True)
def _test_mongo_server():
    start_server()
    yield
    drop_test_databases()
    stop_server()


@pytest.fixture(autouse=True)
def _drop_test_databases():
    yield
    drop_test_databases()


@pytest.fixture
def mongo_client() -> TestMongoClient:
    """Gerçek test Mongo'suna `AsyncMongoClient` (veritabanı adları `__app___test_` önekli)."""
    return TestMongoClient()


@pytest.fixture
def mock_db(monkeypatch: pytest.MonkeyPatch, mongo_client: TestMongoClient):
    """Lifespan `connect_to_mongo` / `close_mongo_connection`'ı test veritabanına bağlar (ad tarihî: artık sahte değil)."""
    import __app__.api.main as main_module
    import __app__.core.db as db_module

    client = mongo_client
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
    """`make_token("user-1", role="admin")`; `expires_in` negatifse süresi geçmiş token.

    Auth kullanıcıyı DB'den okur (docs/backend/auth.md): `sub` için test veritabanına bir `users` kaydı yazılır
    (`sub` ObjectId değilse ondan türetilen sabit id). `role` yoksa `user`; `status="suspended"` askıda kullanıcı.
    """
    import hashlib

    import jwt
    from bson import ObjectId

    from __app__.core.config import settings

    def _make(
        sub: str,
        *,
        role: str | list[str] | None = None,
        expires_in: int = 3600,
        status: str = "active",
        seed_user: bool = True,
    ) -> str:
        user_id = sub if ObjectId.is_valid(sub) else hashlib.md5(sub.encode()).hexdigest()[:24]
        roles = [role] if isinstance(role, str) else list(role or [])
        if seed_user:
            name = test_db_name("__app___test")
            with MongoClient(start_server()) as sync_client:
                sync_client[name]["users"].replace_one(
                    {"_id": ObjectId(user_id)},
                    {
                        "_id": ObjectId(user_id),
                        "email": f"{user_id}@test.local",
                        "name": sub,
                        "role": "admin" if "admin" in roles else "user",
                        "status": status,
                        "emailVerified": True,
                        "provider": "password",
                        "createdAt": datetime.now(UTC),
                        "updatedAt": datetime.now(UTC),
                    },
                    upsert=True,
                )
        claims: dict[str, object] = {"sub": user_id, "exp": datetime.now(UTC) + timedelta(seconds=expires_in)}
        if role is not None:
            claims["role"] = role
        return jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    return _make
