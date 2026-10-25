"""Shared aliases imported by other modules (absolute import)."""

from typing import Annotated, Literal

from pydantic import StringConstraints

Sku = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=12, pattern=r"^[A-Z0-9-]+$")]
Currency = Literal["USD", "EUR", "TRY"]
