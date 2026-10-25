"""HTTP middleware'ler — şu an sadece trace ID injection.

Pure-ASGI implementasyonu kullanılır; `BaseHTTPMiddleware`'in request/response
body ile ilgili bilinen sürprizlerinden kaçınır.

Response body'deki `traceId` alanı endpoint tarafından (dep injection ile) veya
exception handler tarafından set edilir. Bu middleware sadece:
    * `X-Request-Id` (sözleşme, K4) ya da eski `X-Trace-Id` request header'ını (en çok 128 karakter; uzunsa
      yok sayılır) veya yeni `uuid4()`'yi `request.state.trace_id`'e yazar,
    * Aynı değeri response'ta iki header'a da yansıtır,
    * `structlog` contextvars'a bind eder.

Başlık adları sabittir (sözleşme); CORS `expose_headers` için `TRACE_ID_HEADER` / `LEGACY_TRACE_ID_HEADER` kullanılır.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import structlog

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send


TRACE_ID_HEADER = "X-Request-Id"
LEGACY_TRACE_ID_HEADER = "X-Trace-Id"
MAX_TRACE_ID_LENGTH = 128


class TraceIdMiddleware:
    """Pure-ASGI trace ID middleware."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        header_names = (TRACE_ID_HEADER.lower().encode(), LEGACY_TRACE_ID_HEADER.lower().encode())
        incoming: dict[bytes, str] = {}
        for k, v in scope.get("headers", []):
            if k.lower() in header_names:
                incoming.setdefault(k.lower(), v.decode("latin-1"))
        incoming_trace = next(
            (incoming[h] for h in header_names if h in incoming and 0 < len(incoming[h]) <= MAX_TRACE_ID_LENGTH), None
        )

        trace_id = incoming_trace or str(uuid.uuid4())

        state = scope.setdefault("state", {})
        state["trace_id"] = trace_id

        structlog.contextvars.bind_contextvars(trace_id=trace_id)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                # Aynı header varsa kaldır (duplicate olmasın), sonra ekle.
                headers = [(k, v) for k, v in headers if k.lower() not in header_names]
                headers.extend((name, trace_id.encode("latin-1")) for name in header_names)
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            structlog.contextvars.unbind_contextvars("trace_id")
