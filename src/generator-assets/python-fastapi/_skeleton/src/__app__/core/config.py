"""Uygulama ayarları: ortam değişkenleri ve `.env` (bkz. `.env.example`)."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "__app__"
    ENVIRONMENT: str = "development"
    API_PREFIX: str = "/api/v1"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "__app__"
    MONGO_CONNECT_TIMEOUT_MS: int = 5000
    MONGO_SERVER_SELECTION_TIMEOUT_MS: int = 5000

    # JWT (HS256): `sub` = kullanıcı id'si; rol `users` kaydından okunur. Issuer / audience boşsa denetlenmez.
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = ""
    JWT_AUDIENCE: str = ""
    # Auth (docs/backend/auth.md): access / refresh süreleri.
    JWT_ACCESS_TTL_MINUTES: int = 15
    JWT_REFRESH_TTL_DAYS: int = 30
    # Sosyal giriş client id'leri (virgülle) ve e-posta (SMTP_HOST boşsa e-postalar log'a yazılır).
    GOOGLE_CLIENT_IDS: str = ""
    APPLE_CLIENT_IDS: str = ""
    # Apple token iptali (hesap silme): Team / key id ve .p8 anahtarı; boşsa iptal atlanır.
    APPLE_TEAM_ID: str = ""
    APPLE_KEY_ID: str = ""
    APPLE_PRIVATE_KEY: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    MAIL_FROM: str = ""


settings = Settings()

MIN_JWT_SECRET_LENGTH = 32


def require_jwt_secret() -> None:
    """API açılırken çağrılır: secret yoksa ya da kısaysa uygulama başlamaz."""
    if len(settings.JWT_SECRET) < MIN_JWT_SECRET_LENGTH:
        raise RuntimeError(f"JWT_SECRET is not set (min {MIN_JWT_SECRET_LENGTH} chars).")
