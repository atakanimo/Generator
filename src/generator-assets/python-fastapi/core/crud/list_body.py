"""`POST get-all` gövdesi (api-contract §3). Strict: bilinmeyen anahtar 400; filtreler yalnızca `filters` içinde."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SortOrder = Literal["asc", "desc"]


class ListBody[TFilters: BaseModel](BaseModel):
    model_config = ConfigDict(extra="forbid")

    filters: TFilters | None = None
    page: int | None = Field(default=None, ge=1)
    limit: int | None = None
    sortBy: str | None = None
    sortOrder: SortOrder | None = None


__all__ = ["ListBody", "SortOrder"]
