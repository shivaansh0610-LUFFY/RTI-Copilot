import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def case_id(client: TestClient) -> str:
    response = client.post(
        "/cases", json={"grievanceText": "The road outside my house has been broken for two years."}
    )
    return response.json()["caseId"]
