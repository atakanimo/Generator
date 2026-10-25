"""CRUD uçlarının kullanıcıya giden metinleri (tr / en). Dil isteğin dilidir (`core.http.contract.current_language`)."""

from __future__ import annotations

from typing import Any

_CATALOG: dict[str, dict[str, str]] = {
    "success": {"tr": "İşlem başarılı.", "en": "Success."},
    "created": {"tr": "Kayıt oluşturuldu.", "en": "Record created."},
    "updated": {"tr": "Kayıt güncellendi.", "en": "Record updated."},
    "deleted": {"tr": "Kayıt silindi.", "en": "Record deleted."},
    "bad_request_header": {"tr": "Geçersiz istek", "en": "Bad request"},
    "invalid_body": {"tr": "İstek gövdesi geçersiz.", "en": "Invalid request body."},
    "not_null": {"tr": "Bu alan boş bırakılamaz.", "en": "This field cannot be null."},
    "invalid_sort": {"tr": "Bu alana göre sıralanamaz: {field}", "en": "Cannot sort by: {field}"},
    "unauthorized_header": {"tr": "Yetkisiz", "en": "Unauthorized"},
    "unauthorized": {"tr": "Bu işlem için giriş yapmalısınız.", "en": "Authentication required."},
    "forbidden_header": {"tr": "Erişim engellendi", "en": "Forbidden"},
    "forbidden": {"tr": "Bu işlem için yetkiniz yok.", "en": "You are not allowed to do this."},
    "not_found_header": {"tr": "Bulunamadı", "en": "Not found"},
    "not_found": {"tr": "Kayıt bulunamadı.", "en": "Record not found."},
    "method_not_allowed_header": {"tr": "Desteklenmeyen yöntem", "en": "Method not allowed"},
    "method_not_allowed": {"tr": "Bu uç bu yöntemi desteklemiyor.", "en": "This endpoint does not support this method."},
    "conflict_header": {"tr": "Çakışma", "en": "Conflict"},
    "duplicate": {"tr": "Bu değer zaten kullanılıyor: {field}", "en": "Value already in use: {field}"},
    "reference_not_found": {
        "tr": "İlişkili kayıt bulunamadı: {field}",
        "en": "Related record not found: {field}",
    },
    "internal_header": {"tr": "Sunucu hatası", "en": "Server error"},
    "internal": {"tr": "Beklenmeyen bir hata oluştu.", "en": "An unexpected error occurred."},
}


def crud_text(key: str, **params: Any) -> str:
    from ..http.contract import current_language

    entry = _CATALOG[key]
    text = entry.get(current_language()) or entry["en"]
    return text.format(**params) if params else text


__all__ = ["crud_text"]
