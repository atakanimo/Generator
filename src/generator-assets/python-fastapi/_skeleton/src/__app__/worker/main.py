"""Worker giriş noktası (plan K17): `python -m __app__.worker`.

API ile aynı servis ve repository'leri kullanır. Modüllerin job'ları `register_jobs`'ta kaydedilir, ör.
`scheduler.add_job(run_cleanup, CronTrigger(hour=3), id="cleanup")` (`modules/<modül>/jobs.py`).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import signal

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from __app__.core.db import close_mongo_connection, connect_to_mongo

log = logging.getLogger(__name__)


def register_jobs(scheduler: AsyncIOScheduler) -> None:
    """Modüllerin job'ları; boş iskelette job yok."""
    del scheduler


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    register_jobs(scheduler)
    return scheduler


async def run() -> None:
    await connect_to_mongo()
    scheduler = build_scheduler()
    scheduler.start()
    log.info("worker started: %d job(s)", len(scheduler.get_jobs()))
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)
    try:
        await stop.wait()
    finally:
        scheduler.shutdown(wait=False)
        await close_mongo_connection()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
