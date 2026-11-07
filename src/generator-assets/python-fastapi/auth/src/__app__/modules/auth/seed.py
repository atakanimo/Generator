"""İlk admin (docs/backend/auth.md "İlk admin"): hiç `admin` kullanıcı yoksa `seed/initial_admin.py`'deki kayıt
oluşturulur (o e-postayla hesap varsa admin yapılır). Her açılışta Mongo bağlıyken çalışır; admin varsa bir şey yapmaz."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from __app__.core.db import Database
from __app__.modules.auth.service import USERS
from __app__.seed.initial_admin import INITIAL_ADMIN

log = logging.getLogger(__name__)


async def seed_auth(db: Database) -> None:
    if await db[USERS].count_documents({"role": "admin"}, limit=1) > 0:
        return
    email = INITIAL_ADMIN["email"].strip().lower()
    now = datetime.now(UTC)
    existing = await db[USERS].find_one({"email": email})
    if existing:
        await db[USERS].update_one(
            {"_id": existing["_id"]}, {"$set": {"role": "admin", "status": "active", "updatedAt": now}}
        )
    else:
        await db[USERS].insert_one(
            {
                "email": email,
                "name": INITIAL_ADMIN["name"],
                "passwordHash": INITIAL_ADMIN["passwordHash"],
                "role": "admin",
                "status": "active",
                "emailVerified": True,
                "provider": "password",
                "createdAt": now,
                "updatedAt": now,
            }
        )
    log.info("auth.seed: ilk admin oluşturuldu (%s)", email)
    print(f"auth.seed {email}", flush=True)
