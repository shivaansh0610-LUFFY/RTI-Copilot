from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The .env file lives at the repo root, shared with the Vite frontend.
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    # No credential-bearing default: the database URL must come from .env or the environment.
    database_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    # Off by default so tests and local runs without an API key stay offline and
    # deterministic; the mock drafting logic is used until this is explicitly enabled.
    use_llm_drafting: bool = False
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
