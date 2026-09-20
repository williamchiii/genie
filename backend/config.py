from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = Field(default=8787, ge=1, le=65535)
    link_timeout_seconds: float = Field(default=12, gt=0, le=20)
    max_redirects: int = Field(default=5, ge=0, le=10)
    cache_ttl_seconds: int = Field(default=1800, ge=1)
    cache_max_entries: int = Field(default=256, ge=1, le=10000)
    gemini_enabled: bool = True
    gemini_model: str = Field(default="gemini-2.5-flash", pattern=r"^[a-zA-Z0-9._-]+$")
    gemini_timeout_seconds: float = Field(default=10, gt=0, le=20)
    check_timeout_seconds: float = Field(default=20, gt=0, le=20)
    evidence_max_pages: int = Field(default=3, ge=1, le=5)
    evidence_max_bytes: int = Field(default=262144, ge=1024, le=1048576)
    evidence_max_chars: int = Field(default=14000, ge=1000, le=30000)
    gemini_api_key: SecretStr = SecretStr("")


settings = Settings()
