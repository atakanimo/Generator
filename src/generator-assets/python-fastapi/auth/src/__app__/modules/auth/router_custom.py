"""Projeye özel auth uçları (`/auth` altında); ortak uçlardan sonra bağlanır."""

from __future__ import annotations

from fastapi import APIRouter


def map_custom_auth_routes(router: APIRouter) -> None:
    return None
