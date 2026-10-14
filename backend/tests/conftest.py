from collections.abc import Iterator

import pytest
from corpus_support import sqlite_engine
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from app import db
from app.config import get_settings
from app.main import app


@pytest.fixture(autouse=True)
def deterministic_settings(monkeypatch):
    """Router tests must stay offline and deterministic regardless of the developer's own
    .env — otherwise USE_LLM_DRAFTING=true (say) makes "mock" tests silently call the real
    Groq API, which is slow, flaky, and can pass or fail test expectations based on whatever
    the model felt like returning rather than the code under test. Tests that want the real
    path (e.g. test_real_drafting.py) call app.services.drafting.real directly instead of
    going through a router, so they are unaffected by this.
    """
    settings = get_settings()
    monkeypatch.setattr(settings, "use_llm_drafting", False)
    monkeypatch.setattr(settings, "use_public_info_lookup", False)


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
