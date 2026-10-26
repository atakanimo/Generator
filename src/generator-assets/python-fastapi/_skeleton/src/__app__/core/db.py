"""MongoDB bağlantısı (plan K5).

Sürücü (PyMongo Async, `pymongo.AsyncMongoClient`) yalnız bu dosyada. Kod (`core/crud` dahil) yalnızca `Database`
takma adına göre yazılır; sürücü değişince yalnız bu dosya değişir. PyMongo Async'te `aggregate()` ve
`client.close()` `await` ister.
"""

from __future__ import annotations

import logging

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from __app__.core.config import settings
from __app__.core.errors.app_error import AppError
from __app__.core.errors.common_codes import CommonErrorCodes

Database = AsyncDatabase

log = logging.getLogger(__name__)


class _MongoState:
    client: AsyncMongoClient | None = None
    db: Database | None = None
    is_connected: bool = False


_state = _MongoState()


def open_mongo_client(uri: str, **options: object) -> AsyncMongoClient:
    return AsyncMongoClient(uri, uuidRepresentation="standard", **options)


async def connect_to_mongo() -> None:
    """API / worker açılırken. Mongo kapalıysa uygulama yine açılır; `get_db` 503 döner, sağlık ucu raporlar."""
    if _state.client is not None:
        return
    client = open_mongo_client(
        settings.MONGO_URI,
        connectTimeoutMS=settings.MONGO_CONNECT_TIMEOUT_MS,
        serverSelectionTimeoutMS=settings.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    )
    try:
        await client.admin.command("ping")
    except Exception as exc:
        log.warning("mongo connection failed: %s", exc)
        await client.close()
        return
    _state.client = client
    _state.db = client[settings.MONGO_DB_NAME]
    _state.is_connected = True


async def close_mongo_connection() -> None:
    if _state.client is not None:
        await _state.client.close()
    _state.client = None
    _state.db = None
    _state.is_connected = False


def get_db() -> Database:
    """FastAPI dependency (`DbDep`)."""
    if _state.db is None or not _state.is_connected:
        unavailable = int(CommonErrorCodes.SERVICE_UNAVAILABLE)
        raise AppError(unavailable, "Database is unavailable.", status=unavailable)
    return _state.db


def is_mongo_connected() -> bool:
    return _state.is_connected
