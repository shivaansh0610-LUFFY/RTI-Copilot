import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from app import db
from app.config import Settings
from app.main import app


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ignore the developer's real .env and environment, and reset the engine cache."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(db, "get_settings", lambda: Settings(_env_file=None))
    db.get_engine.cache_clear()
    yield
    db.get_engine.cache_clear()


def test_database_url_has_no_default() -> None:
    assert Settings(_env_file=None).database_url == ""


def test_database_url_is_read_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    assert Settings(_env_file=None).database_url == "sqlite://"


def test_app_starts_without_a_database() -> None:
    assert TestClient(app).get("/health").status_code == 200
    assert db.get_engine.cache_info().currsize == 0


def test_engine_requires_database_url() -> None:
    with pytest.raises(RuntimeError, match="DATABASE_URL is not set"):
        db.get_engine()
    # A failure must not be cached, or fixing the config would still fail.
    assert db.get_engine.cache_info().currsize == 0


def test_engine_is_built_lazily_from_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    configured_url = "sqlite:///configured_url_probe.db"
    monkeypatch.setattr(db, "get_settings", lambda: Settings(_env_file=None, database_url=configured_url))
    db.get_engine.cache_clear()
    engine = db.get_engine()
    assert isinstance(engine, Engine)
    assert str(engine.url) == configured_url
    assert db.get_engine() is engine
