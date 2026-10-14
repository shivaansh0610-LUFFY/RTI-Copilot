import pytest
from fastapi.testclient import TestClient

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
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def case_id(client: TestClient) -> str:
    response = client.post(
        "/cases", json={"grievanceText": "The road outside my house has been broken for two years."}
    )
    return response.json()["caseId"]
