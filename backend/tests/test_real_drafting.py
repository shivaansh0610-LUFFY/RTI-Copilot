from app.config import get_settings
from app.schemas import InformationRequest
from app.services import grounding
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


MB_PASSAGE = grounding.CorpusPassage(
    id="S-1",
    text="All measurements of work done shall be recorded in the Measurement Book. " * 8,
    page=112,
    source_title="CPWD Works Manual 2024",
    url="https://cpwd.gov.in/WriteReadData/man_cir/65002.pdf",
)


def test_decompose_cites_only_passages_it_was_given(monkeypatch):
    monkeypatch.setattr(get_settings(), "use_corpus_citations", True)
    monkeypatch.setattr(real.grounding, "relevant_passages", lambda grievance: [MB_PASSAGE])
    seen = {}

    def fake(system, user, **kwargs):
        seen.update(system=system, user=user)
        return [
            {"category": "Measurement Book", "title": "Copy of the MB entries", "quality": "good", "basis": "S-1"},
            {"category": "Work order", "title": "Copy of the work order", "quality": "good", "basis": "S-7"},
            {"category": "x" * 200, "title": "Amount spent", "quality": "good", "basis": None},
        ]

    monkeypatch.setattr(real.llm, "complete_json", fake)

    requests = real.decompose_grievance("Pothole on Ring Road", {"period": "Last 1 year"})

    assert "[S-1] (CPWD Works Manual 2024, PDF page 112)" in seen["user"]
    assert '"basis"' in seen["system"]
    assert requests[0].basis.source_title == "CPWD Works Manual 2024"
    assert requests[0].basis.page == 112
    assert requests[0].basis.quote.endswith("…") and len(requests[0].basis.quote) <= 282
    assert requests[1].basis is None  # S-7 was never offered
    assert len(requests[2].category) == 80


def test_decompose_works_without_the_corpus(monkeypatch):
    monkeypatch.setattr(get_settings(), "use_corpus_citations", True)

    def no_database(grievance):
        raise RuntimeError("passages table missing")

    monkeypatch.setattr(real.grounding, "relevant_passages", no_database)
    monkeypatch.setattr(
        real.llm, "complete_json", lambda *a, **k: [{"category": "Work order", "title": "Copy of the work order"}]
    )

    requests = real.decompose_grievance("Pothole", {})

    assert [request.title for request in requests] == ["Copy of the work order"]
    assert requests[0].basis is None


SECOND_REQUEST = SAMPLE_REQUEST.model_copy(
    update={"id": "RQ-002", "category": "Expenditure", "title": "Amount spent on repairing the road"}
)
GRIEVANCE = "Pothole for 6 months.\n\nLocation: Ring Road, Lajpat Nagar (28.56700, 77.24300)"


def test_generate_draft_returns_the_model_text(monkeypatch):
    seen = {}

    def fake(system, user, **kwargs):
        seen.update(system=system, user=user)
        return {"draft": "Under Section 6(1)...\n\n1. Copy of the work order\n2. Amount spent\n\nTransfer under 6(3)."}

    monkeypatch.setattr(real.llm, "complete_json", fake)

    draft = real.generate_draft(GRIEVANCE, [SAMPLE_REQUEST, SECOND_REQUEST], "hi")

    assert draft.startswith("Under Section 6(1)")
    # The grievance (with its location line) and every request reach the model, in order.
    assert "Location: Ring Road, Lajpat Nagar" in seen["user"]
    assert seen["user"].index(SAMPLE_REQUEST.title) < seen["user"].index(SECOND_REQUEST.title)
    assert "exactly 2 numbered items" in seen["system"]
    assert "Hindi" in seen["system"]


def test_generate_draft_falls_back_when_a_request_is_merged_or_dropped(monkeypatch):
    monkeypatch.setattr(real.llm, "complete_json", lambda *a, **k: {"draft": "Intro\n1. Both records together"})

    draft = real.generate_draft(GRIEVANCE, [SAMPLE_REQUEST, SECOND_REQUEST])

    assert draft == real.mock.generate_draft([SAMPLE_REQUEST, SECOND_REQUEST])


def test_generate_draft_falls_back_on_failure(monkeypatch):
    def raise_timeout(*args, **kwargs):
        raise TimeoutError("Groq did not answer")

    monkeypatch.setattr(real.llm, "complete_json", raise_timeout)

    assert real.generate_draft(GRIEVANCE, [SAMPLE_REQUEST]) == real.mock.generate_draft([SAMPLE_REQUEST])


def test_check_public_info_uses_the_real_lookup(monkeypatch):
    monkeypatch.setattr(real.public_info, "check_public_info", lambda requests: ["looked up"])

    assert real.check_public_info([SAMPLE_REQUEST]) == ["looked up"]


def test_check_public_info_marks_requests_unchecked_on_failure(monkeypatch):
    def raise_no_database(*args, **kwargs):
        raise RuntimeError("DATABASE_URL is not set")

    monkeypatch.setattr(real.public_info, "check_public_info", raise_no_database)

    requests = real.check_public_info([SAMPLE_REQUEST])

    # No 500, and no invented citation: the mock would mark RQ-001 public with a made-up source.
    assert [request.publicly_available for request in requests] == [None]
    assert [request.public_source for request in requests] == [None]
    assert requests[0].title == SAMPLE_REQUEST.title


def test_quotes_lose_the_page_headers_of_the_cpwd_pdfs():
    raw = (
        "SECTION 53 CPWD WORKS MANUAL 2014 160 Years of Engineering Excellence 324 "
        "Annexure - V Proforma For Quality Control Inspection"
    )
    assert grounding.quote(raw) == "Annexure - V Proforma For Quality Control Inspection"
    assert grounding.clean("197 197 ANNEXURE TO SOPs 20.1.12A. The work") == "20.1.12A. The work"
