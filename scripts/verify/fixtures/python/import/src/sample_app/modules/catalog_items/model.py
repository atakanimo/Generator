"""PY7 import fixture: every construct the Pydantic parser reads (and two it refuses, in `CatalogItemsBad`)."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import IntEnum, StrEnum
from typing import Annotated, Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, NonNegativeInt, PositiveInt, conint, field_validator

from sample_app.modules.shared.types import Currency, Sku

from ..shared.types import Sku as SkuRelative

_STRICT = ConfigDict(extra="forbid")

Status = Literal["draft", "active", "archived"]


class Color(StrEnum):
    RED = "red"
    DARK_BLUE = "dark-blue"


class Priority(IntEnum):
    LOW = 10
    HIGH = 20


class Price(BaseModel):
    model_config = _STRICT

    amount: float = Field(..., ge=0)
    currency: Currency
    note: str | None = None
    vat: bool = True


class Dimension(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    value: int
    tags: list[str] = Field(default_factory=list)


class Base(BaseModel):
    model_config = _STRICT

    id: str | None = None
    sku: Sku


class CatalogItems(Base):
    """Document class: named like the module (K21)."""

    title: str = Field(..., min_length=1, max_length=80)
    altSku: Optional[SkuRelative] = None
    status: Status = "draft"
    color: Color = Color.RED
    priority: Priority = Priority.HIGH
    stock: NonNegativeInt = 0
    minOrder: PositiveInt
    rating: Annotated[float, Field(gt=0, le=5)] | None = None
    score: conint(ge=1, le=100) = 50
    contactEmail: EmailStr | None = None
    releasedOn: date | None = None
    price: Price
    dimensions: list[Dimension] = Field(default_factory=list)
    counters: dict[str, int] = Field(default_factory=dict)
    meta: dict[str, Any] = Field(default_factory=dict)
    cost: Decimal = Decimal("0.50")
    ownerId: str | None = None
    labels: list[Literal["new", "sale"]] = Field(default_factory=list)
    archivedAt: datetime | None
    createdAt: datetime
    updatedAt: datetime

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        return v.strip()


class CatalogItemsBad(BaseModel):
    model_config = _STRICT

    blob: bytes
    token: UUID
    ok: str = "x"
