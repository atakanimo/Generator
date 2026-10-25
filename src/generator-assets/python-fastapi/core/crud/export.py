"""Admin CSV export (api-contract §2 "Export", PY12): gövde, hücre kuralları, CSV metni. Satırları `CrudService.export_csv`
okur (liste sorgusunun aynısı, sayfasız); bu modül yalnız biçimdir (Express `export-csv`, .NET `CsvExport` ile aynı kurallar).
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict

from .list_body import SortOrder

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

EXPORT_ROW_LIMIT = 50_000
"""Bir export'ta en fazla satır; aşılırsa 400 (filtre daraltılır)."""

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
# Sayı gibi görünen metin (decimal wire `-12.50`) formül değil; önek eklenmez.
_NUMBER_TEXT = re.compile(r"-?\d+(\.\d+)?", re.ASCII)


class ExportBody[TFilters: BaseModel](BaseModel):
    """`POST export` gövdesi: liste isteğinin filtre / sıralama kısmı + kolonlar. Strict."""

    model_config = ConfigDict(extra="forbid")

    filters: TFilters | None = None
    sortBy: str | None = None
    sortOrder: SortOrder | None = None
    fields: list[str] | None = None
    headers: list[str] | None = None


def cell_text(value: Any, display: str | None = None) -> str:
    """Bir hücre: `null` boş, ilişki `display` alanı (yoksa id), dizi / obje sıkışık JSON, metinde formül koruması."""
    if value is None:
        return ""
    if display is not None:
        if isinstance(value, list):
            return _json([_display(v, display) for v in value])
        return cell_text(_display(value, display))
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return json.dumps(value)
    if isinstance(value, dict | list):
        return _json(value)
    text = str(value)
    if text.startswith(_FORMULA_PREFIXES) and not _NUMBER_TEXT.fullmatch(text):
        return f"'{text}"
    return text


def render_csv(
    rows: Sequence[Mapping[str, Any]],
    columns: Sequence[str],
    headers: Sequence[str],
    displays: Mapping[str, str],
) -> str:
    """RFC 4180 (`,`, `\\r\\n`), UTF-8 BOM'lu metin."""
    lines = [_csv_line(headers)]
    lines.extend(_csv_line([cell_text(row.get(c), displays.get(c)) for c in columns]) for row in rows)
    return "﻿" + "".join(f"{line}\r\n" for line in lines)


def export_filename(route: str) -> str:
    """`<route>-<YYYY-MM-DD>.csv` (UTC tarih)."""
    return f"{route}-{datetime.now(UTC).strftime('%Y-%m-%d')}.csv"


def _display(value: Any, display: str) -> Any:
    if isinstance(value, dict):
        shown = value.get(display)
        return shown if shown is not None else value.get("id")
    return value


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _csv_line(cells: Sequence[str]) -> str:
    return ",".join(_quote(c) for c in cells)


def _quote(cell: str) -> str:
    if any(ch in cell for ch in ',"\r\n'):
        return '"' + cell.replace('"', '""') + '"'
    return cell


__all__ = ["EXPORT_ROW_LIMIT", "ExportBody", "cell_text", "export_filename", "render_csv"]
