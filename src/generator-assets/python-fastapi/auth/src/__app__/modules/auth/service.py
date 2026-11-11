"""Auth servisi (docs/backend/auth.md): oturum üretme / yenileme / iptal, şifre, e-posta kodu, sosyal giriş.

Koleksiyonlar: `users` (Generator modeli), `refresh_tokens`, `otp_codes` (yalnız hash'ler).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

# @if register|password-reset
# @if google|apple
from __app__.core.auth import mailer, otp, social
# @else
from __app__.core.auth import mailer, otp
# @endif
# @else
# @if google|apple
from __app__.core.auth import social
# @endif
# @endif
# @if apple
from __app__.core.auth.apple_token import exchange_apple_code, revoke_apple_token
# @endif
from __app__.core.auth.messages import auth_text
from __app__.core.auth.passwords import hash_password, password_policy_error, verify_password
from __app__.core.auth.tokens import (
    access_token_ttl_seconds,
    new_refresh_token,
    refresh_token_ttl,
    sha256,
    sign_access_token,
)
from __app__.core.db import Database
from __app__.core.errors.app_error import AppError
from __app__.core.errors.common_codes import CommonErrorCodes
from __app__.modules.auth import hooks
from __app__.modules.auth.schemas import AuthSession, AuthUser

USERS = "users"
REFRESH_TOKENS = "refresh_tokens"
OTP_CODES = "otp_codes"


def _now() -> datetime:
    return datetime.now(UTC)


def _err(code: CommonErrorCodes, key: str) -> AppError:
    status = int(code)
    return AppError(status, auth_text(key), status=status)


def _unauthorized(key: str = "invalidCredentials") -> AppError:
    return _err(CommonErrorCodes.UNAUTHORIZED, key)


def _bad_request(key: str) -> AppError:
    return _err(CommonErrorCodes.BAD_REQUEST, key)


def _check_policy(password: str) -> None:
    error = password_policy_error(password)
    if error:
        raise _bad_request(error)


def to_auth_user(user: dict[str, Any]) -> AuthUser:
    return AuthUser(
        id=str(user["_id"]),
        email=user["email"],
        name=user.get("name") or "",
        role="admin" if user.get("role") == "admin" else "user",
        provider=user.get("provider") or "password",
        emailVerified=bool(user.get("emailVerified")),
        hasPassword=bool(user.get("passwordHash")),
    )


async def ensure_auth_indexes(db: Database) -> None:
    """Açılışta (`api/main.py` lifespan): token tabloları; süresi dolan satırları Mongo siler."""
    await db[REFRESH_TOKENS].create_index("tokenHash", unique=True)
    await db[REFRESH_TOKENS].create_index("userId")
    await db[REFRESH_TOKENS].create_index("expiresAt", expireAfterSeconds=0)
    # @if register|password-reset
    await db[OTP_CODES].create_index([("userId", 1), ("purpose", 1)])
    await db[OTP_CODES].create_index("expiresAt", expireAfterSeconds=0)
    # @endif


async def load_user(db: Database, user_id: str) -> dict[str, Any] | None:
    try:
        oid = ObjectId(user_id)
    except (InvalidId, TypeError):
        return None
    return await db[USERS].find_one({"_id": oid})


async def _with_hook_fields(db: Database, user: dict[str, Any], model: Any) -> Any:
    extra = await hooks.on_session(db, user)
    return model.model_copy(update=extra) if extra else model


async def _issue_session(
    db: Database, user: dict[str, Any], client: dict[str, str | None], is_new_user: bool | None = None
) -> AuthSession:
    refresh = new_refresh_token()
    await db[REFRESH_TOKENS].insert_one(
        {
            "userId": user["_id"],
            "tokenHash": sha256(refresh),
            "expiresAt": _now() + refresh_token_ttl(),
            "revokedAt": None,
            "userAgent": (client.get("userAgent") or "")[:300] or None,
            "ip": client.get("ip"),
            "createdAt": _now(),
        }
    )
    session = AuthSession(
        accessToken=sign_access_token(str(user["_id"]), user.get("role") or "user"),
        refreshToken=refresh,
        expiresIn=access_token_ttl_seconds(),
        user=to_auth_user(user),
        isNewUser=is_new_user,
    )
    return await _with_hook_fields(db, user, session)


async def _revoke_all(db: Database, user_id: ObjectId) -> None:
    await db[REFRESH_TOKENS].update_many(
        {"userId": user_id, "revokedAt": None}, {"$set": {"revokedAt": _now()}}
    )


def _is_admin(user: dict[str, Any]) -> bool:
    """Admin yalnız e-posta + şifreyle girer (docs/backend/auth.md "Admin ve kullanıcı"): kayıt, sıfırlama, sosyal giriş,
    şifre oluşturma ve hesap silme `user` hesapları içindir."""
    return user.get("role") == "admin"


def _block_suspended(user: dict[str, Any]) -> None:
    if user.get("status") == "suspended":
        raise _err(CommonErrorCodes.FORBIDDEN, "suspended")


async def login(db: Database, email: str, password: str, client: dict[str, str | None]) -> AuthSession:
    user = await db[USERS].find_one({"email": email})
    ok = await verify_password(password, user.get("passwordHash") if user else None)
    if not user or not ok:
        raise _unauthorized()
    _block_suspended(user)
    # @if register
    # Admin'in doğrulama yolu yok (admin'e OTP gitmez): yalnız `user` hesabı bekletilir.
    if not user.get("emailVerified") and not _is_admin(user):
        raise _err(CommonErrorCodes.EMAIL_NOT_VERIFIED, "emailNotVerified")
    # @endif
    await db[USERS].update_one({"_id": user["_id"]}, {"$set": {"lastLoginAt": _now()}})
    return await _issue_session(db, user, client)


async def refresh(db: Database, token: str, client: dict[str, str | None]) -> AuthSession:
    """Rotation: sunulan token tek atomik adımda tüketilir (aynı token'la iki istek → yalnız biri kazanır)."""
    row = await db[REFRESH_TOKENS].find_one_and_update(
        {"tokenHash": sha256(token), "revokedAt": None, "expiresAt": {"$gt": _now()}},
        {"$set": {"revokedAt": _now()}},
    )
    if not row:
        raise _unauthorized("invalidToken")
    user = await db[USERS].find_one({"_id": row["userId"]})
    if not user:
        raise _unauthorized("invalidToken")
    _block_suspended(user)
    return await _issue_session(db, user, client)


async def logout(db: Database, token: str | None) -> None:
    if token:
        await db[REFRESH_TOKENS].update_one(
            {"tokenHash": sha256(token), "revokedAt": None}, {"$set": {"revokedAt": _now()}}
        )


async def me(db: Database, user: dict[str, Any]) -> AuthUser:
    return await _with_hook_fields(db, user, to_auth_user(user))


async def change_password(db: Database, user: dict[str, Any], current: str, new: str) -> None:
    if not await verify_password(current, user.get("passwordHash")):
        raise _bad_request("wrongPassword")
    _check_policy(new)
    await db[USERS].update_one({"_id": user["_id"]}, {"$set": {"passwordHash": await hash_password(new)}})
    await _revoke_all(db, user["_id"])


async def admin_set_password(db: Database, user_id: str, new: str) -> None:
    """Admin bir kullanıcının şifresini belirler (admin CRUD `passwordHash` yazmaz); o kullanıcının oturumları biter."""
    _check_policy(new)
    user = await load_user(db, user_id)
    if not user:
        raise _err(CommonErrorCodes.NOT_FOUND, "notFound")
    await db[USERS].update_one({"_id": user["_id"]}, {"$set": {"passwordHash": await hash_password(new)}})
    await _revoke_all(db, user["_id"])


# @if register|password-reset


async def _send_otp(db: Database, user: dict[str, Any], purpose: str) -> None:
    code = otp.new_otp_code()
    await db[OTP_CODES].delete_many({"userId": user["_id"], "purpose": purpose})
    await db[OTP_CODES].insert_one(
        {
            "userId": user["_id"],
            "purpose": purpose,
            "codeHash": otp.hash_otp(code),
            "expiresAt": _now() + otp.OTP_TTL,
            "attempts": 0,
            "consumedAt": None,
            "createdAt": _now(),
        }
    )
    subject = auth_text("verifySubject" if purpose == "verify" else "resetSubject")
    minutes = int(otp.OTP_TTL.total_seconds() // 60)
    await mailer.send_mail(user["email"], subject, auth_text("codeText", code=code, minutes=minutes))


async def _consume_otp(db: Database, user: dict[str, Any], purpose: str, code: str) -> bool:
    """Yanlış kod → attempts++; `OTP_MAX_ATTEMPTS` sonrası kod ölür (yenisi istenir)."""
    row = await db[OTP_CODES].find_one({"userId": user["_id"], "purpose": purpose, "consumedAt": None})
    if not row or row["expiresAt"].replace(tzinfo=UTC) <= _now() or row["attempts"] >= otp.OTP_MAX_ATTEMPTS:
        return False
    if not otp.otp_matches(code, row["codeHash"]):
        await db[OTP_CODES].update_one({"_id": row["_id"]}, {"$inc": {"attempts": 1}})
        return False
    await db[OTP_CODES].update_one({"_id": row["_id"]}, {"$set": {"consumedAt": _now()}})
    return True


# @endif
# @if register


async def register(db: Database, email: str, password: str, name: str) -> None:
    _check_policy(password)
    existing = await db[USERS].find_one({"email": email})
    if existing:
        # Yeni hesapla aynı cevap (e-posta ele verilmez). Doğrulanmamış hesap kodu doğrulayanındır: son kaydın şifresi geçer.
        if (
            not existing.get("emailVerified")
            and existing.get("provider") == "password"
            and not _is_admin(existing)
        ):
            await db[USERS].update_one(
                {"_id": existing["_id"]},
                {"$set": {"passwordHash": await hash_password(password), "name": name, "updatedAt": _now()}},
            )
            await _send_otp(db, existing, "verify")
        return
    now = _now()
    user: dict[str, Any] = {
        "email": email,
        "name": name,
        "passwordHash": await hash_password(password),
        "role": "user",
        "status": "active",
        "emailVerified": False,
        "provider": "password",
        "createdAt": now,
        "updatedAt": now,
    }
    await hooks.on_register(db, user, {"email": email, "name": name})
    user["_id"] = (await db[USERS].insert_one(user)).inserted_id
    await _send_otp(db, user, "verify")


async def verify_email(db: Database, email: str, code: str, client: dict[str, str | None]) -> AuthSession:
    user = await db[USERS].find_one({"email": email})
    if not user or _is_admin(user) or not await _consume_otp(db, user, "verify", code):
        raise _bad_request("invalidCode")
    _block_suspended(user)
    await db[USERS].update_one({"_id": user["_id"]}, {"$set": {"emailVerified": True, "lastLoginAt": _now()}})
    user["emailVerified"] = True
    return await _issue_session(db, user, client, True)


async def resend_otp(db: Database, email: str, purpose: str) -> None:
    user = await db[USERS].find_one({"email": email})
    if (
        user
        and user.get("status") == "active"
        and not _is_admin(user)
        and (purpose == "reset" or not user.get("emailVerified"))
    ):
        await _send_otp(db, user, purpose)


# @endif
# @if password-reset


async def forgot_password(db: Database, email: str) -> None:
    user = await db[USERS].find_one({"email": email})
    if user and user.get("status") == "active" and not _is_admin(user):
        await _send_otp(db, user, "reset")


async def reset_password(db: Database, email: str, code: str, new: str) -> None:
    _check_policy(new)
    user = await db[USERS].find_one({"email": email})
    if not user or _is_admin(user) or not await _consume_otp(db, user, "reset", code):
        raise _bad_request("invalidCode")
    # Kod gelen kutusuna ulaştı: adres doğrulanmış sayılır.
    await db[USERS].update_one(
        {"_id": user["_id"]}, {"$set": {"passwordHash": await hash_password(new), "emailVerified": True}}
    )
    await _revoke_all(db, user["_id"])


# @endif
# @if google|apple


async def _social_login(
    db: Database,
    provider: str,
    identity: social.SocialIdentity | None,
    client: dict[str, str | None],
    fallback_name: str | None = None,
    apple_refresh_token: str | None = None,
) -> AuthSession:
    """Sağlayıcı id'si kullanıcıyı bulur; yoksa doğrulanmış e-posta var olan hesaba bağlanır; yoksa yeni `user`."""
    if identity is None:
        raise _unauthorized("invalidToken")
    user = await db[USERS].find_one({"provider": provider, "providerUserId": identity.provider_user_id})
    is_new = False
    unset: dict[str, Any] = {}
    link: dict[str, Any] = {}
    if not user and identity.email:
        user = await db[USERS].find_one({"email": identity.email})
        if user and _is_admin(user):
            raise _err(CommonErrorCodes.FORBIDDEN, "adminPasswordOnly")
        # Sağlayıcının doğrulamadığı adres var olan hesabı alamaz.
        if user and not identity.email_verified:
            raise _bad_request("emailInUse")
        # Sağlayıcı adresi doğruladı: doğrulanmamış kaydı açanın şifresi artık çalışmaz.
        if user and not user.get("emailVerified"):
            unset["passwordHash"] = ""
        # Aynı sağlayıcıyla açılmış ama kimliği kaydedilmemiş (taşınmış) hesap bu kimliğe bağlanır.
        if user and user.get("provider") == provider and not user.get("providerUserId"):
            link["providerUserId"] = identity.provider_user_id
    if not user:
        if not identity.email:
            raise _bad_request("emailRequired")
        now = _now()
        user = {
            "email": identity.email,
            "name": identity.name or fallback_name or identity.email.split("@")[0],
            "role": "user",
            "status": "active",
            "emailVerified": identity.email_verified,
            "provider": provider,
            "providerUserId": identity.provider_user_id,
            "createdAt": now,
            "updatedAt": now,
        }
        await hooks.on_register(db, user, {"provider": provider})
        user["_id"] = (await db[USERS].insert_one(user)).inserted_id
        is_new = True
    if _is_admin(user):
        raise _err(CommonErrorCodes.FORBIDDEN, "adminPasswordOnly")
    _block_suspended(user)
    update: dict[str, Any] = {"lastLoginAt": _now(), **link}
    if identity.email_verified:
        update["emailVerified"] = True
        user["emailVerified"] = True
    # @if apple
    if apple_refresh_token:
        update["appleRefreshToken"] = apple_refresh_token
    # @endif
    await db[USERS].update_one({"_id": user["_id"]}, {"$set": update, **({"$unset": unset} if unset else {})})
    return await _issue_session(db, user, client, is_new)


async def set_password(db: Database, user: dict[str, Any], new: str) -> None:
    """Google / Apple hesabı ilk şifresini oluşturur (sonrası `change-password`). Diğer oturumlar kalır."""
    if _is_admin(user):
        raise _err(CommonErrorCodes.FORBIDDEN, "adminNotAllowed")
    if user.get("passwordHash"):
        raise _bad_request("passwordAlreadySet")
    _check_policy(new)
    await db[USERS].update_one(
        {"_id": user["_id"]}, {"$set": {"passwordHash": await hash_password(new), "updatedAt": _now()}}
    )


# @endif
# @if google


async def login_with_google(db: Database, id_token: str, client: dict[str, str | None]) -> AuthSession:
    return await _social_login(db, "google", await social.verify_google_id_token(id_token), client)


# @endif
# @if apple


async def login_with_apple(
    db: Database,
    identity_token: str,
    client: dict[str, str | None],
    full_name: str | None = None,
    authorization_code: str | None = None,
) -> AuthSession:
    """`authorizationCode` geldiyse Apple refresh token'ı saklanır (hesap silinince iptal için; docs/backend/auth.md)."""
    identity = await social.verify_apple_identity_token(identity_token)
    refresh = await exchange_apple_code(authorization_code, identity) if identity and authorization_code else None
    return await _social_login(db, "apple", identity, client, full_name, refresh)


# @endif
# @if account-delete


async def delete_account(db: Database, user: dict[str, Any]) -> None:
    # Admin hesabını başka bir admin panelden siler, kendisi silemez.
    if _is_admin(user):
        raise _err(CommonErrorCodes.FORBIDDEN, "adminNotAllowed")
    await hooks.on_account_delete(db, user)
    await db[REFRESH_TOKENS].delete_many({"userId": user["_id"]})
    # @if register|password-reset
    await db[OTP_CODES].delete_many({"userId": user["_id"]})
    # @endif
    await db[USERS].delete_one({"_id": user["_id"]})
    # @if apple
    # App Store şartı: Apple ile açılan hesabın token'ı Apple'da da iptal edilir (hata log'a; silme geri alınmaz).
    if user.get("appleRefreshToken"):
        await revoke_apple_token(user["appleRefreshToken"])
    # @endif


# @endif
