from app.schemas import InformationRequest
from app.services.drafting import real


def test_decompose_grievance_parses_llm_response(monkeypatch):
    monkeypatch.setattr(
        real.llm,
        "complete_json",
        lambda system, user, **kwargs: [
            {"category": "Work order", "title": "Copy of the work order", "quality": "good"},
            {"category": "Expenditure", "title": "Amount spent", "quality": "needs-detail"},
        ],
    )

    requests = real.decompose_grievance("The road is broken", {"period": "Last 6 months"})

    assert [r.id for r in requests] == ["RQ-001", "RQ-002"]
    assert requests[0].category == "Work order"
    assert requests[0].quality == "good"
    assert requests[1].quality == "needs-detail"
    assert all(r.period == "Last 6 months" for r in requests)
    assert all(r.source == "generated" for r in requests)


def test_decompose_grievance_falls_back_to_mock_on_bad_response(monkeypatch):
    def raise_bad_json(*args, **kwargs):
        raise ValueError("Model did not return valid JSON")

    monkeypatch.setattr(real.llm, "complete_json", raise_bad_json)

    requests = real.decompose_grievance("The road is broken", {"period": "Last 1 year"})

    # Falls back to the deterministic mock rather than letting the endpoint 500.
    assert requests == real.mock.decompose_grievance("The road is broken", {"period": "Last 1 year"})


def test_decompose_grievance_falls_back_on_empty_array(monkeypatch):
    monkeypatch.setattr(real.llm, "complete_json", lambda *a, **k: [])

    requests = real.decompose_grievance("The road is broken", {})

    assert requests == real.mock.decompose_grievance("The road is broken", {})


SAMPLE_REQUEST = InformationRequest(
    id="RQ-001",
    category="Work order",
    title="Copy of the work order sanctioning repair of the road",
    authority="PWD",
    period="Last 1 year",
    quality="good",
)


def test_check_public_info_uses_the_real_lookup(monkeypatch):
    monkeypatch.setattr(real.public_info, "check_public_info", lambda requests: ["looked up"])

    assert real.check_public_info([SAMPLE_REQUEST]) == ["looked up"]


def test_check_public_info_falls_back_to_mock_on_failure(monkeypatch):
    def raise_no_database(*args, **kwargs):
        raise RuntimeError("DATABASE_URL is not set")

    monkeypatch.setattr(real.public_info, "check_public_info", raise_no_database)

    requests = real.check_public_info([SAMPLE_REQUEST])

    # Falls back to the deterministic mock rather than letting the endpoint 500.
    assert requests == real.mock.check_public_info([SAMPLE_REQUEST])
