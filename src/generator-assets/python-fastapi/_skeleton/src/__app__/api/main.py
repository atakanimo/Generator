"""API giriş noktası: `uvicorn __app__.api.main:app`.

`create_app()` middleware'leri, sağlık ucunu, auth uçlarını (`modules/auth`) ve üretilen admin CRUD router'larını (`routers_generated.py`) bağlar;
açılışta üretilen modüllerin index'leri kurulur (`indexes_generated.py`).
Elle yazılan router'lar da burada eklenir.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from __app__.api.indexes_generated import ensure_crud_indexes
from __app__.api.routers_generated import ADMIN_CRUD_ROUTERS
from __app__.core.config import require_jwt_secret, settings
from __app__.core.db import close_mongo_connection, connect_to_mongo, get_db, is_mongo_connected
from __app__.core.http.contract import (
    ContractResponse,
    ContractRoute,
    contract_ok,
    install_contract_handlers,
)
from __app__.core.http.middleware.trace import LEGACY_TRACE_ID_HEADER, TRACE_ID_HEADER, TraceIdMiddleware
from __app__.modules.auth.router import router as auth_router
from __app__.modules.auth.seed import seed_auth
from __app__.modules.auth.service import ensure_auth_indexes

if TYPE_CHECKING:
    from collections.abc import AsyncIterator


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    require_jwt_secret()
    await connect_to_mongo()
    if is_mongo_connected():
        # Üretilen modüllerin index'leri (unique dahil); Mongo kapalıysa uygulama yine açılır.
        await ensure_crud_indexes(get_db())
        # Auth: token tablolarının index'leri ve ilk admin (docs/backend/auth.md).
        await ensure_auth_indexes(get_db())
        await seed_auth(get_db())
    try:
        yield
    finally:
        await close_mongo_connection()


class HealthData(BaseModel):
    status: str
    environment: str
    mongoConnected: bool


health_router = APIRouter(tags=["health"], route_class=ContractRoute)


@health_router.get("/health", response_model=ContractResponse[HealthData])
async def health() -> ContractResponse[HealthData]:
    return contract_ok(HealthData(status="ok", environment=settings.ENVIRONMENT, mongoConnected=is_mongo_connected()))


def create_app() -> FastAPI:
    app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)
    # Tanımsız yol / method, doğrulama ve beklenmeyen hatalar da sözleşme zarfıyla (api-contract §1).
    install_contract_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[TRACE_ID_HEADER, LEGACY_TRACE_ID_HEADER],
    )
    # En dışta: her yanıt (CORS dahil) trace başlıklarını taşır.
    app.add_middleware(TraceIdMiddleware)

    app.include_router(health_router, prefix=settings.API_PREFIX)
    app.include_router(auth_router, prefix=settings.API_PREFIX)
    for router in ADMIN_CRUD_ROUTERS:
        app.include_router(router, prefix=settings.API_PREFIX)
    return app


app = create_app()
