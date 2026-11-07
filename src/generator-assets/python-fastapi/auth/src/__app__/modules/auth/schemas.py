"""Auth istek / cevap gövdeleri (sözleşme: docs/backend/auth.md)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

_EMAIL = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
Email = Annotated[str, Field(max_length=320, pattern=_EMAIL), AfterValidator(lambda v: v.strip().lower())]
# Kural (uzunluk, harf + rakam) serviste denetlenir; mesaj dile göre gelir.
Password = Annotated[str, Field(min_length=1, max_length=200)]
Code = Annotated[str, Field(pattern=r"^\d{6}$")]


class _Body(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class LoginBody(_Body):
    email: Email
    password: Password


class RefreshBody(_Body):
    refreshToken: str = Field(min_length=1, max_length=200)


class LogoutBody(_Body):
    refreshToken: str | None = Field(default=None, min_length=1, max_length=200)


class ChangePasswordBody(_Body):
    currentPassword: Password
    newPassword: Password


class AdminSetPasswordBody(_Body):
    userId: str = Field(pattern=r"^[a-fA-F0-9]{24}$")
    newPassword: Password


# @if register


class RegisterBody(_Body):
    email: Email
    password: Password
    name: str = Field(min_length=1, max_length=200)


class VerifyEmailBody(_Body):
    email: Email
    code: Code


class SendOtpBody(_Body):
    email: Email
    purpose: Literal["verify", "reset"] = "verify"


# @endif
# @if password-reset


class ForgotPasswordBody(_Body):
    email: Email


class ResetPasswordBody(_Body):
    email: Email
    code: Code
    newPassword: Password


# @endif
# @if google


class GoogleBody(_Body):
    idToken: str = Field(min_length=1)


# @endif
# @if apple


class AppleBody(_Body):
    identityToken: str = Field(min_length=1)
    authorizationCode: str | None = None
    fullName: str | None = Field(default=None, max_length=200)


# @endif
# @if google|apple


class SetPasswordBody(_Body):
    newPassword: Password


# @endif


class AuthUser(BaseModel):
    """Sözleşmenin `AuthUser`'ı; `onSession` hook'unun ek alanları da taşınır."""

    model_config = ConfigDict(extra="allow")

    id: str
    email: str
    name: str
    role: Literal["admin", "user"]
    provider: str
    emailVerified: bool
    # Google / Apple hesabı henüz şifre oluşturmadıysa False (`set-password`).
    hasPassword: bool


class AuthSession(BaseModel):
    model_config = ConfigDict(extra="allow")

    accessToken: str
    refreshToken: str
    expiresIn: int
    user: AuthUser
    isNewUser: bool | None = None
