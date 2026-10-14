from collections.abc import Iterator

import pytest
from corpus_support import sqlite_engine
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from app import db
from app.main import app


@pytest.fixture
def db_engine(monkeypatch: pytest.MonkeyPatch) -> Iterator[Engine]:
    """An empty in-memory database, used by the app (through the real app.db.get_db) in place of
    the one DATABASE_URL names. Tests can open their own sessions on it to see what was stored."""
    with sqlite_engine() as engine:
        monkeypatch.setattr(db, "get_engine", lambda: engine)
        yield engine


@pytest.fixture
def client(db_engine: Engine) -> TestClient:
    return TestClient(app)


@pytest.fixture
def case_id(client: TestClient) -> str:
    response = client.post(
        "/cases", json={"grievanceText": "The road outside my house has been broken for two years."}
    )
    return response.json()["caseId"]
