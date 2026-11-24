from collections.abc import Iterator

import pytest
from corpus_support import sqlite_engine
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from app import db
from app.config import get_settings
from app.main import app
from app.services import response_analysis
from app.services.drafting import real
from ingest import extract


@pytest.fixture(autouse=True)
def no_real_ocr(monkeypatch):
    """OCR shells out to a real Tesseract install that tests must never reach for -- it would
    make the suite slow, dependent on whatever binary/language data happens to be on the
    machine running the tests, and off in CI where Tesseract isn't installed. This stubs out
    only the recognition step, so _ocr_page's own rendering logic still runs (cheap, local, no
    subprocess); tests of OCR itself give their own fake recognizer instead."""
    monkeypatch.setattr(extract, "_recognize_text", lambda image_bytes: "")


@pytest.fixture(autouse=True)
def no_real_grounding(monkeypatch):
    """Grounding a finding against the corpus loads the real (1.3 GB) embedding model and hits
    a real database -- both off in this suite. This stubs the one entry point response_analysis
    calls; tests of grounding itself monkeypatch it back with a canned result."""
    monkeypatch.setattr(response_analysis.grounding, "passages_for", lambda *a, **k: [])


@pytest.fixture(autouse=True)
def clean_clarify_cache():
    """The same-grievance-same-question cache in app.services.drafting.real is a module-level
    dict, so without this, one test's cached result would leak into the next test that happens
    to reuse the same grievance text."""
    real._clarify_cache.clear()
    yield
    real._clarify_cache.clear()


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
    monkeypatch.setattr(settings, "use_corpus_citations", False)


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
