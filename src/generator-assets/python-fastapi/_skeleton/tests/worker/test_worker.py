"""Worker iskeleti: scheduler kurulur, import yan etkisizdir."""

from __future__ import annotations

from __app__.worker.main import build_scheduler


def test_scheduler_builds_without_jobs() -> None:
    scheduler = build_scheduler()
    assert scheduler.get_jobs() == []
