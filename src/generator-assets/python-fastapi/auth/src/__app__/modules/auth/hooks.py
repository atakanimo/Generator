"""Auth iş kuralları. Generator bir kez yazar, sonra projenindir: gereken hook doldurulur."""

from __future__ import annotations

from typing import Any

# `user`: `users` dokümanı (dict). `db`: `Database`.


async def on_register(db: Any, user: dict[str, Any], body: dict[str, Any]) -> None:
    """Yeni kullanıcı kaydedilmeden önce (register / ilk sosyal giriş): projeye özel alanlar (ör. `region`)."""


async def on_session(db: Any, user: dict[str, Any]) -> dict[str, Any]:
    """Her oturum / `me` cevabına eklenecek alanlar (ör. `subscription`)."""
    return {}


async def on_account_delete(db: Any, user: dict[str, Any]) -> None:
    """`DELETE /auth/account` (account-delete modülü): kullanıcı satırı silinmeden önce kendi verisi silinir."""
