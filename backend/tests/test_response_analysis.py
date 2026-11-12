import pytest
from corpus_support import make_pdf

from app.config import get_settings
from app.schemas import InformationRequest
from app.schemas.responses import AppealItem
from app.services import appeal, response_analysis
from app.services.response_analysis import UNAVAILABLE, UnreadableReply, classify_reply, read_reply

REPLY_LINES = [
    "Reply to RTI application.",
    "1. A copy of the work order WO/2026/12 for the repair of Ring Road is enclosed.",
    "2. The expenditure details are not available with this office.",
    "3. Please deposit Rs. 40 as copying charges for the inspection report.",
]


def request(rq_id: str, title: str) -> InformationRequest:
    return InformationRequest(
        id=rq_id, category="Record", title=title, authority="PWD", period="Last 1 year", quality="good"
    )


REQUESTS = [
    request("RQ-001", "Copy of the work order for the repair of Ring Road"),
    request("RQ-002", "Amount spent on repairing Ring Road"),
    request("RQ-003", "Copy of the latest inspection report of Ring Road"),
]


# --- reading the reply ------------------------------------------------------------------------


def test_read_reply_numbers_the_passages_of_a_pdf():
    pages, passages = read_reply("reply.pdf", make_pdf([REPLY_LINES, ["Public Information Officer"]]))

    assert pages == 2
    assert [passage.id for passage in passages] == [f"P-{n}" for n in range(1, len(passages) + 1)]
    assert passages[-1].page == 2
    assert "WO/2026/12" in " ".join(passage.text for passage in passages)


def test_read_reply_reads_plain_text():
    pages, passages = read_reply("reply.txt", "\n\n".join(REPLY_LINES).encode())

    assert pages == 1
    assert any("copying charges" in passage.text for passage in passages)


@pytest.mark.parametrize(
    ("filename", "data", "message"),
    [
        ("scan.pdf", make_pdf([[]]), "scanned"),
        ("photo.jpg", b"\xff\xd8\xff\xe0 not text", "PDF and plain-text"),
        ("broken.pdf", b"%PDF-1.4 garbage", "could not be read"),
    ],
)
def test_read_reply_refuses_what_it_cannot_read(filename, data, message):
    with pytest.raises(UnreadableReply, match=message):
        read_reply(filename, data)


# --- classifying it ---------------------------------------------------------------------------


@pytest.fixture
def passages():
    return read_reply("reply.txt", "\n\n".join(REPLY_LINES).encode())[1]


def fake_model(monkeypatch, payload):
    monkeypatch.setattr(response_analysis.llm, "complete_json", lambda *a, **k: payload)


def test_classify_reply_keeps_cited_findings(monkeypatch, passages):
    fake_model(
        monkeypatch,
        {
            "results": [
                {"request_id": "RQ-001", "label": "RESPONSIVE", "explanation": "Given.", "evidence": ["P-2"]},
                {"request_id": "RQ-002", "label": "NO_RECORD_STATED", "explanation": "Not held.", "evidence": ["P-3"]},
                {"request_id": "RQ-003", "label": "FEE_DEMANDED", "explanation": "Pay Rs 40.", "evidence": ["P-4"]},
            ]
        },
    )

    results = classify_reply(REQUESTS, passages)

    assert [result.label for result in results] == ["RESPONSIVE", "NO_RECORD_STATED", "FEE_DEMANDED"]
    assert [result.evidence[0].id for result in results] == ["P-2", "P-3", "P-4"]
    assert "WO/2026/12" in results[0].evidence[0].text


def test_classify_reply_never_trusts_an_uncited_or_unknown_finding(monkeypatch, passages):
    fake_model(
        monkeypatch,
        {
            "results": [
                # Claims an answer but cites a passage that does not exist.
                {"request_id": "RQ-001", "label": "RESPONSIVE", "explanation": "Given.", "evidence": ["P-99"]},
                {"request_id": "RQ-002", "label": "PROBABLY_FINE", "explanation": "?", "evidence": ["P-3"]},
                # RQ-003 left out entirely.
            ]
        },
    )

    results = classify_reply(REQUESTS, passages)

    assert [result.label for result in results] == ["INSUFFICIENT_EVIDENCE"] * 3
    assert all(result.abstention_reason for result in results)


def test_classify_reply_allows_non_responsive_without_evidence(monkeypatch, passages):
    fake_model(
        monkeypatch,
        {"results": [{"request_id": "RQ-001", "label": "NON_RESPONSIVE", "explanation": "Ignored.", "evidence": []}]},
    )

    assert classify_reply(REQUESTS[:1], passages)[0].label == "NON_RESPONSIVE"


def test_classify_reply_abstains_on_every_request_when_the_model_fails(monkeypatch, passages):
    def raise_timeout(*args, **kwargs):
        raise TimeoutError("Groq did not answer")

    monkeypatch.setattr(response_analysis.llm, "complete_json", raise_timeout)

    results = classify_reply(REQUESTS, passages)

    assert [result.label for result in results] == ["INSUFFICIENT_EVIDENCE"] * 3
    assert {result.abstention_reason for result in results} == {UNAVAILABLE}


# --- the API ----------------------------------------------------------------------------------


def stored_requests(client, case_id):
    response = client.post(f"/cases/{case_id}/decompose", json={"clarification": {"period": "Last 1 year"}})
    return response.json()


def upload(client, case_id, name="reply.txt", data=None):
    data = data if data is not None else "\n\n".join(REPLY_LINES).encode()
    return client.post(f"/cases/{case_id}/response", files={"file": (name, data, "application/octet-stream")})


def test_response_endpoint_classifies_every_stored_request(client, case_id, monkeypatch):
    monkeypatch.setattr(get_settings(), "use_llm_drafting", True)
    requests = stored_requests(client, case_id)
    fake_model(
        monkeypatch,
        {"results": [{"request_id": r["id"], "label": "NON_RESPONSIVE", "explanation": "No."} for r in requests]},
    )

    response = upload(client, case_id)

    assert response.status_code == 200
    body = response.json()
    assert body["pages"] == 1 and body["ocrUsed"] is False
    assert [result["requestId"] for result in body["results"]] == [r["id"] for r in requests]
    assert {result["label"] for result in body["results"]} == {"NON_RESPONSIVE"}


def test_response_endpoint_never_guesses_when_ai_is_off(client, case_id):
    stored_requests(client, case_id)

    body = upload(client, case_id).json()

    assert {result["label"] for result in body["results"]} == {"INSUFFICIENT_EVIDENCE"}
    assert "switched off" in body["results"][0]["abstentionReason"]


def test_response_endpoint_needs_requests_first(client, case_id):
    assert upload(client, case_id).status_code == 409


def test_response_endpoint_explains_an_unreadable_file(client, case_id):
    stored_requests(client, case_id)

    response = upload(client, case_id, name="scan.pdf", data=make_pdf([[]]))

    assert response.status_code == 422
    assert "scanned" in response.json()["detail"]


# --- the appeal -------------------------------------------------------------------------------

ITEMS = [
    AppealItem(request_id="RQ-002", title="Amount spent", label="NO_RECORD_STATED", explanation="Not held."),
    AppealItem(request_id="RQ-003", title="Inspection report", label="FEE_DEMANDED", explanation="Pay Rs 40."),
]


def test_appeal_uses_the_template_when_ai_is_off():
    text = appeal.generate_appeal("Pothole", ITEMS)

    assert "Section 19(1)" in text
    assert "1. Amount spent: said to have no record." in text
    assert "[registration number]" in text and "[Your name]" in text


def test_appeal_uses_the_model_and_falls_back_on_a_mismatch(monkeypatch):
    monkeypatch.setattr(get_settings(), "use_llm_drafting", True)
    monkeypatch.setattr(
        appeal.llm, "complete_json", lambda *a, **k: {"appeal": "To, ...\n1. Amount spent\n2. Inspection report"}
    )
    assert appeal.generate_appeal("Pothole", ITEMS).startswith("To, ...")

    monkeypatch.setattr(appeal.llm, "complete_json", lambda *a, **k: {"appeal": "To, ...\n1. Everything"})
    assert appeal.generate_appeal("Pothole", ITEMS) == appeal.template_appeal(ITEMS)


def test_appeal_endpoint(client, case_id):
    items = [item.model_dump(by_alias=True) for item in ITEMS]

    response = client.post(f"/cases/{case_id}/appeal", json={"items": items})

    assert response.status_code == 200
    assert "Section 19(1)" in response.json()["appealText"]
    assert client.post(f"/cases/{case_id}/appeal", json={"items": []}).status_code == 422
