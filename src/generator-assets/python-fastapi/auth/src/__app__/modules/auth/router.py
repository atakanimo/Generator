"""`/auth` uçları (docs/backend/auth.md "Sözleşme"). Generator bir kez yazar, sonra projenindir."""

from __future__ import annotations

from fastapi import APIRouter, Request

from __app__.api.deps import AdminDep, DbDep, UserDep
from __app__.core.auth.messages import auth_text
from __app__.core.http.client_ip import client_ip
from __app__.core.http.contract import ContractResponse, ContractRoute, contract_ok
from __app__.modules.auth import schemas, service
from __app__.modules.auth.router_custom import map_custom_auth_routes

router = APIRouter(prefix="/auth", tags=["auth"], route_class=ContractRoute)


def _client(request: Request) -> dict[str, str | None]:
    return {
        "userAgent": request.headers.get("user-agent"),
        "ip": client_ip(request),
    }


def _signed_in(request: Request, session: schemas.AuthSession) -> schemas.AuthSession:
    """Oturumu açan kullanıcıyı isteğe bağlar: denetim / log katmanı `request.state.auth_user_id` ile aktörü okur."""
    request.state.auth_user_id = session.user.id
    request.state.auth_role = session.user.role
    return session


@router.post(
    "/login",
    response_model=ContractResponse[schemas.AuthSession],
)
async def login(
    body: schemas.LoginBody, request: Request, db: DbDep
) -> ContractResponse[schemas.AuthSession]:
    return contract_ok(
        _signed_in(request, await service.login(db, body.email, body.password, _client(request))),
        auth_text("loggedIn"),
    )


@router.post(
    "/refresh",
    response_model=ContractResponse[schemas.AuthSession],
)
async def refresh(
    body: schemas.RefreshBody, request: Request, db: DbDep
) -> ContractResponse[schemas.AuthSession]:
    return contract_ok(await service.refresh(db, body.refreshToken, _client(request)))


@router.post("/logout", response_model=ContractResponse[None])
async def logout(body: schemas.LogoutBody, db: DbDep) -> ContractResponse[None]:
    await service.logout(db, body.refreshToken)
    return contract_ok(None, auth_text("loggedOut"))


@router.get("/me", response_model=ContractResponse[schemas.AuthUser])
async def me(user: UserDep, db: DbDep) -> ContractResponse[schemas.AuthUser]:
    return contract_ok(await service.me(db, user.doc))


@router.post("/change-password", response_model=ContractResponse[None])
async def change_password(
    body: schemas.ChangePasswordBody, user: UserDep, db: DbDep
) -> ContractResponse[None]:
    await service.change_password(db, user.doc, body.currentPassword, body.newPassword)
    return contract_ok(None, auth_text("passwordChanged"))


@router.post("/admin/set-password", response_model=ContractResponse[None])
async def admin_set_password(
    body: schemas.AdminSetPasswordBody, _admin: AdminDep, db: DbDep
) -> ContractResponse[None]:
    await service.admin_set_password(db, body.userId, body.newPassword)
    return contract_ok(None, auth_text("passwordChanged"))


# @if register


@router.post(
    "/register",
    response_model=ContractResponse[None],
)
async def register(body: schemas.RegisterBody, db: DbDep) -> ContractResponse[None]:
    await service.register(db, body.email, body.password, body.name)
    return contract_ok(None, auth_text("otpSent"))


@router.post(
    "/verify-email",
    response_model=ContractResponse[schemas.AuthSession],
)
async def verify_email(
    body: schemas.VerifyEmailBody, request: Request, db: DbDep
) -> ContractResponse[schemas.AuthSession]:
    return contract_ok(
        _signed_in(request, await service.verify_email(db, body.email, body.code, _client(request))),
        auth_text("emailVerified"),
    )


@router.post(
    "/send-otp",
    response_model=ContractResponse[None],
)
async def send_otp(body: schemas.SendOtpBody, db: DbDep) -> ContractResponse[None]:
    await service.resend_otp(db, body.email, body.purpose)
    return contract_ok(None, auth_text("otpSent"))


# @endif
# @if password-reset


@router.post(
    "/forgot-password",
    response_model=ContractResponse[None],
)
async def forgot_password(body: schemas.ForgotPasswordBody, db: DbDep) -> ContractResponse[None]:
    await service.forgot_password(db, body.email)
    return contract_ok(None, auth_text("otpSent"))


@router.post(
    "/reset-password",
    response_model=ContractResponse[None],
)
async def reset_password(body: schemas.ResetPasswordBody, db: DbDep) -> ContractResponse[None]:
    await service.reset_password(db, body.email, body.code, body.newPassword)
    return contract_ok(None, auth_text("passwordChanged"))


# @endif
# @if google


@router.post(
    "/google",
    response_model=ContractResponse[schemas.AuthSession],
)
async def google(
    body: schemas.GoogleBody, request: Request, db: DbDep
) -> ContractResponse[schemas.AuthSession]:
    return contract_ok(
        _signed_in(request, await service.login_with_google(db, body.idToken, _client(request))),
        auth_text("loggedIn"),
    )


# @endif
# @if apple


@router.post(
    "/apple",
    response_model=ContractResponse[schemas.AuthSession],
)
async def apple(
    body: schemas.AppleBody, request: Request, db: DbDep
) -> ContractResponse[schemas.AuthSession]:
    session = await service.login_with_apple(
        db, body.identityToken, _client(request), body.fullName, body.authorizationCode
    )
    return contract_ok(_signed_in(request, session), auth_text("loggedIn"))


# @endif
# @if google|apple


@router.post(
    "/set-password",
    response_model=ContractResponse[None],
)
async def set_password(body: schemas.SetPasswordBody, user: UserDep, db: DbDep) -> ContractResponse[None]:
    await service.set_password(db, user.doc, body.newPassword)
    return contract_ok(None, auth_text("passwordCreated"))


# @endif
# @if account-delete


@router.delete("/account", response_model=ContractResponse[None])
async def delete_account(user: UserDep, db: DbDep) -> ContractResponse[None]:
    await service.delete_account(db, user.doc)
    return contract_ok(None, auth_text("accountDeleted"))


# @endif


map_custom_auth_routes(router)
