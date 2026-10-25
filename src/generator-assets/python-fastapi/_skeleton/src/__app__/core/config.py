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

    # JWT (HS256): `sub` = kullanıcı id'si, `role` = rol (string ya da liste). Issuer / audience boşsa denetlenmez.
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = ""
    JWT_AUDIENCE: str = ""
    ADMIN_ROLE: str = "admin"


settings = Settings()

MIN_JWT_SECRET_LENGTH = 32


def require_jwt_secret() -> None:
    """API açılırken çağrılır: secret yoksa ya da kısaysa uygulama başlamaz."""
    if len(settings.JWT_SECRET) < MIN_JWT_SECRET_LENGTH:
        raise RuntimeError(f"JWT_SECRET is not set (min {MIN_JWT_SECRET_LENGTH} chars).")
