"""Sözleşme zarfı (api-contract §1) ve onu yazan route sınıfı.

Yalnızca `route_class=ContractRoute` ile kurulan router'lar bu zarfı döner (admin-crud uçları). Global exception
handler'lar ve projenin diğer uçları değişmez. Route sınıfı isteğin dilini ve `traceId`'sini bağlama koyar,
uçtan ya da dependency'lerden kaçan hatayı zarfa çevirir:

- `AppError` → kendi kodu ve status'u
- gövde / sorgu doğrulaması (`RequestValidationError`) → 400
- `HTTPException` (auth dependency'leri) → status'u; `error_data` taşıyorsa onun kodu ve metni
- diğerleri → 500
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from contextvars import ContextVar
from http import HTTPStatus
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..crud.messages import crud_text
from ..errors.app_error import AppError
from ..errors.common_codes import CommonErrorCodes

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine, Iterator

    from fastapi import FastAPI
    from starlette.requests import Request
    from starlette.responses import Response

log = logging.getLogger(__name__)

SUPPORTED_LANGUAGES: tuple[str, ...] = ("en", "tr")
DEFAULT_LANGUAGE = "en"

_language: ContextVar[str] = ContextVar("contract_language", default=DEFAULT_LANGUAGE)
_trace_id: ContextVar[str | None] = ContextVar("contract_trace_id", default=None)


class ContractErrorData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    header: str
    message: str
    code: int


class ContractResponse[T](BaseModel):
    model_config = ConfigDict(extra="forbid")

    isSuccess: bool
    data: T | None = None
    uiMessage: str | None = None
    errorData: ContractErrorData | None = None
    traceId: str | None = None


def current_language() -> str:
    """İsteğin dili (`SUPPORTED_LANGUAGES`); route dışında `DEFAULT_LANGUAGE`."""
    return _language.get()


def contract_ok[T](data: T | None = None, ui_message: str | None = None) -> ContractResponse[T]:
    return ContractResponse[T](
        isSuccess=True,
        data=data,
        uiMessage=ui_message if ui_message is not None else crud_text("success"),
        traceId=_trace_id.get(),
    )


def normalize_language(value: str | None) -> str | None:
    """`tr-TR,tr;q=0.9` → `tr`; desteklenmeyen ya da boş değer → `None`."""
    tag = (value or "").split(",")[0].split(";")[0].strip()
    code = tag.replace("_", "-").split("-")[0].lower()
    return code if code in SUPPORTED_LANGUAGES else None


def request_language(request: Request) -> str:
    """İstek dili yalnız `Accept-Language` (api-contract K6)."""
    return normalize_language(request.headers.get("accept-language")) or DEFAULT_LANGUAGE


def _error_response(status: int, code: int, header: str, message: str) -> JSONResponse:
    body = ContractResponse[Any](
        isSuccess=False,
        errorData=ContractErrorData(header=header, message=message, code=code),
        traceId=_trace_id.get(),
    )
    return JSONResponse(status_code=status, content=jsonable_encoder(body.model_dump(mode="json")))


def _validation_message(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return crud_text("invalid_body")
    first = errors[0]
    loc = [str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path")]
    msg = str(first.get("msg", "invalid"))
    return f"{'.'.join(loc)}: {msg}" if loc else msg


_STATUS_TEXT = {
    401: ("unauthorized_header", "unauthorized"),
    403: ("forbidden_header", "forbidden"),
    404: ("not_found_header", "not_found"),
    405: ("method_not_allowed_header", "method_not_allowed"),
}


def _http_exception_response(exc: StarletteHTTPException) -> JSONResponse:
    error_data = getattr(exc, "error_data", None)
    if error_data is not None:
        code = int(getattr(error_data, "code", exc.status_code) or exc.status_code)
        header = str(getattr(error_data, "header", "") or "")
        message = str(getattr(error_data, "message", "") or "")
        return _error_response(exc.status_code, code, header, message)
    header_key, message_key = _STATUS_TEXT.get(exc.status_code, ("bad_request_header", "invalid_body"))
    # Starlette'in varsayılan metni ("Not Found", "Method Not Allowed") yerine yerelleştirilmiş metin.
    default_phrase = exc.detail == _status_phrase(exc.status_code)
    message = exc.detail if isinstance(exc.detail, str) and not default_phrase else crud_text(message_key)
    return _error_response(exc.status_code, exc.status_code, crud_text(header_key), message)


class ContractRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            lang_token = _language.set(request_language(request))
            trace_token = _trace_id.set(getattr(request.state, "trace_id", None) or None)
            try:
                return await original(request)
            except AppError as exc:
                header = exc.header or crud_text(_header_key(exc.status))
                return _error_response(exc.status, exc.code, header, exc.message)
            except RequestValidationError as exc:
                bad = int(CommonErrorCodes.BAD_REQUEST)
                return _error_response(bad, bad, crud_text("bad_request_header"), _validation_message(exc))
            except HTTPException as exc:
                return _http_exception_response(exc)
            except Exception:
                log.exception("contract route failed: %s %s", request.method, request.url.path)
                internal = int(CommonErrorCodes.INTERNAL_SERVER_ERROR)
                return _error_response(internal, internal, crud_text("internal_header"), crud_text("internal"))
            finally:
                _trace_id.reset(trace_token)
                _language.reset(lang_token)

        return handler


def _status_phrase(status: int) -> str | None:
    try:
        return HTTPStatus(status).phrase
    except ValueError:
        return None


@contextmanager
def _request_context(request: Request) -> Iterator[None]:
    """`ContractRoute` dışındaki handler'lar için isteğin dili ve `traceId`'si."""
    lang_token = _language.set(request_language(request))
    trace_token = _trace_id.set(getattr(request.state, "trace_id", None) or None)
    try:
        yield
    finally:
        _trace_id.reset(trace_token)
        _language.reset(lang_token)


def install_contract_handlers(app: FastAPI) -> None:
    """Router dışında kalan hataları da sözleşme cevabıyla döndürür: tanımsız yol (404), desteklenmeyen method (405),
    `ContractRoute` kullanmayan uçlardaki doğrulama (400) ve beklenmeyen hata (500). `ContractRoute` uçları kendi
    hatalarını zaten çevirir. `create_app()` çağırır.
    """

    async def http_error(request: Request, exc: StarletteHTTPException) -> Response:
        with _request_context(request):
            return _http_exception_response(exc)

    async def validation_error(request: Request, exc: RequestValidationError) -> Response:
        with _request_context(request):
            bad = int(CommonErrorCodes.BAD_REQUEST)
            return _error_response(bad, bad, crud_text("bad_request_header"), _validation_message(exc))

    async def app_error(request: Request, exc: AppError) -> Response:
        with _request_context(request):
            return _error_response(exc.status, exc.code, exc.header or crud_text(_header_key(exc.status)), exc.message)

    async def unexpected_error(request: Request, exc: Exception) -> Response:
        with _request_context(request):
            log.exception("request failed: %s %s", request.method, request.url.path, exc_info=exc)
            internal = int(CommonErrorCodes.INTERNAL_SERVER_ERROR)
            return _error_response(internal, internal, crud_text("internal_header"), crud_text("internal"))

    app.add_exception_handler(StarletteHTTPException, http_error)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error)  # type: ignore[arg-type]
    app.add_exception_handler(AppError, app_error)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unexpected_error)


def _header_key(status: int) -> str:
    return {
        401: "unauthorized_header",
        403: "forbidden_header",
        404: "not_found_header",
        405: "method_not_allowed_header",
        409: "conflict_header",
    }.get(status, "internal_header" if status >= 500 else "bad_request_header")


__all__ = [
    "DEFAULT_LANGUAGE",
    "SUPPORTED_LANGUAGES",
    "ContractErrorData",
    "ContractResponse",
    "ContractRoute",
    "contract_ok",
    "current_language",
    "install_contract_handlers",
    "normalize_language",
    "request_language",
]
