"""İsteği yapan kullanıcı (admin CRUD): üretilen router `_service` bağımlılığında yazar, hook'lar `current_actor()` ile okur
(ör. `createdBy`). İstek dışında (job, script) `None`."""

from __future__ import annotations

from contextvars import ContextVar

_actor: ContextVar[str | None] = ContextVar("crud_actor", default=None)


def current_actor() -> str | None:
    return _actor.get()


def set_current_actor(actor_id: str | None) -> None:
    _actor.set(actor_id)
