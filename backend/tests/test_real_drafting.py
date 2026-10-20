from app.schemas import InformationRequest
from app.services.drafting import real


def test_generate_clarify_result_parses_questions_and_answers(monkeypatch):
    monkeypatch.setattr(
        real.llm,
        "complete_json",
        lambda system, user, **kwargs: {
            "answers": {"period": "Last 2 months"},
            "questions": [
                {"key": "location", "question": "Where is the pothole?", "options": ["Main road", "Side street"]},
            ],
        },
    )

    result = real.generate_clarify_result("Pothole since 2 months")

    assert result.answers == {"period": "Last 2 months"}
    assert [q.key for q in result.questions] == ["location"]
    assert result.questions[0].options == ["Main road", "Side street"]


def test_generate_clarify_result_allows_no_questions_when_everything_is_known(monkeypatch):
    monkeypatch.setattr(
        real.llm,
        "complete_json",
        lambda *a, **k: {"answers": {"period": "Last 2 months"}, "questions": []},
    )

    result = real.generate_clarify_result("Pothole since 2 months on Main Road")

    assert result.answers == {"period": "Last 2 months"}
    assert result.questions == []


def test_generate_clarify_result_falls_back_to_mock_on_bad_response(monkeypatch):
    def raise_bad_json(*args, **kwargs):
        raise ValueError("Model did not return valid JSON")

    monkeypatch.setattr(real.llm, "complete_json", raise_bad_json)

    result = real.generate_clarify_result("There is a pothole")

    assert result == real.mock.generate_clarify_result("There is a pothole")


def test_generate_clarify_result_falls_back_when_period_resolved_nowhere(monkeypatch):
    monkeypatch.setattr(
        real.llm,
        "complete_json",
        lambda *a, **k: {"answers": {}, "questions": [{"key": "location", "question": "Where?", "options": ["A", "B"]}]},
    )

    result = real.generate_clarify_result("There is a pothole")

    # "period" missing from both answers and questions is treated as a bad response.
    assert result == real.mock.generate_clarify_result("There is a pothole")


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


def test_decompose_grievance_passes_every_clarification_answer_as_context(monkeypatch):
    seen_prompts = []
    monkeypatch.setattr(
        real.llm,
        "complete_json",
        lambda system, user, **kwargs: seen_prompts.append(user)
        or [{"category": "Work order", "title": "x", "quality": "good"}],
    )

    real.decompose_grievance(
        "There is a pothole", {"period": "Last 1 year", "location": "Main road"}
    )

    assert "location: Main road" in seen_prompts[0]
    assert "period: Last 1 year" in seen_prompts[0]


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
