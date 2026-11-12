import json
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy.orm import Session

from app import case_store
from app.schemas import InformationRequest
from app.services import llm, preflight

# The same cases src/components/rti-drafting-wizard/preflight.test.ts checks the browser's copy
# of the rules against.
CASES_FILE = Path(__file__).resolve().parents[2] / "src/components/rti-drafting-wizard/preflight-cases.json"
CASES = json.loads(CASES_FILE.read_text())


def make_request(title: str, *, id: str = "RQ-001", quality: str = "good", source: str | None = "generated"):
    return InformationRequest(
        id=id, category="Work order", title=title, authority="PWD", period="Last 1 year", quality=quality, source=source
    )


GOOD = make_request("Copy of the work order sanctioning repair of the road at the above location", id="RQ-001")
WHY = make_request("Why has the road outside my house not been repaired for two years?", id="RQ-002")
INSPECT = make_request(
    "Inspection of the road work and its records, under Section 2(j)(i) of the RTI Act",
    id="RQ-INSPECT",
    source="inspection",
)


@pytest.mark.parametrize("case", CASES, ids=[case["title"][:40] for case in CASES])
def test_rules_match_the_shared_cases(case):
    request = make_request(case["title"], quality=case.get("quality", "good"), source=case.get("source", "generated"))
    assert preflight.rule_issues(request) == case["codes"]


def test_without_ai_only_the_rules_run(monkeypatch):
    monkeypatch.setattr(llm, "complete_json", lambda *a, **k: pytest.fail("the model was called"))

    result = preflight.check_requests("Pothole on Ring Road", [GOOD, WHY, INSPECT], use_ai=False)

    assert result.ai_used is False
    assert [item.request_id for item in result.items] == ["RQ-001", "RQ-002", "RQ-INSPECT"]
    assert [[issue.code for issue in item.issues] for item in result.items] == [[], ["QUESTION_NOT_RECORD"], []]
    issue = result.items[1].issues[0]
    assert issue.section == "Section 2(f)"
    assert "records, not answers" in issue.officer_says
    assert result.items[1].suggested_title is None


def fake_model(monkeypatch, reply):
    calls = []

    def complete_json(system, user, **kwargs):
        calls.append((system, user))
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(llm, "complete_json", complete_json)
    return calls


def test_the_model_adds_excuses_and_a_rewrite(monkeypatch):
    calls = fake_model(
        monkeypatch,
        {
            "results": [
                {"id": "RQ-001", "issues": ["NO_PLACE"], "rewrite": "Copy of the work order for repair of Ring Road near the bus stop"},
                {
                    "id": "RQ-002",
                    "issues": ["QUESTION_NOT_RECORD"],
                    "rewrite": "Copies of the file notings, letters and inspection notes about the repair of this road",
                },
            ]
        },
    )

    result = preflight.check_requests("Pothole on Ring Road", [GOOD, WHY, INSPECT], use_ai=True)

    assert result.ai_used is True
    first, second, inspect = result.items
    assert [issue.code for issue in first.issues] == ["NO_PLACE"]
    assert first.suggested_title == "Copy of the work order for repair of Ring Road near the bus stop"
    assert [issue.code for issue in second.issues] == ["QUESTION_NOT_RECORD"]
    assert second.suggested_title.startswith("Copies of the file notings")
    assert inspect.issues == []
    # The model sees the grievance, the rules' findings, and never our own inspection wording.
    system, user = calls[0]
    assert "Pothole on Ring Road" in user
    assert "[rules found: QUESTION_NOT_RECORD]" in user
    assert "RQ-INSPECT" not in user
    assert "NO_PLACE" in system


def test_rule_findings_stay_when_the_model_misses_them(monkeypatch):
    fake_model(monkeypatch, {"results": [{"id": "RQ-002", "issues": [], "rewrite": None}]})

    result = preflight.check_requests("x", [WHY], use_ai=True)

    assert [issue.code for issue in result.items[0].issues] == ["QUESTION_NOT_RECORD"]


@pytest.mark.parametrize(
    "rewrite",
    [
        "Copy of the work order issued in March 2024 for this road",  # an invented date
        "Copy of work order number [work order number] for this road",  # a placeholder
        "Why was the work order for this road not issued on time",  # still a 'why' question
        "Short",  # too short to file
        "Why has the road outside my house not been repaired for two years?",  # unchanged
        42,
    ],
)
def test_a_rewrite_the_citizen_could_not_file_is_dropped(monkeypatch, rewrite):
    fake_model(monkeypatch, {"results": [{"id": "RQ-002", "issues": ["QUESTION_NOT_RECORD"], "rewrite": rewrite}]})

    item = preflight.check_requests("x", [WHY], use_ai=True).items[0]

    assert [issue.code for issue in item.issues] == ["QUESTION_NOT_RECORD"]
    assert item.suggested_title is None


def test_unknown_excuses_and_ids_are_ignored(monkeypatch):
    fake_model(
        monkeypatch,
        {
            "results": [
                {"id": "RQ-001", "issues": ["SOUNDS_RUDE", "TOO_BROAD"], "rewrite": None},
                {"id": "RQ-999", "issues": ["TOO_VAGUE"], "rewrite": "Copy of something else entirely"},
            ]
        },
    )

    result = preflight.check_requests("x", [GOOD], use_ai=True)

    assert len(result.items) == 1
    assert [issue.code for issue in result.items[0].issues] == ["TOO_BROAD"]
    assert result.items[0].suggested_title is None  # an excuse, but no rewrite offered


def test_a_rewrite_without_any_excuse_is_not_shown(monkeypatch):
    fake_model(
        monkeypatch,
        {"results": [{"id": "RQ-001", "issues": [], "rewrite": "Copy of the work order for repair of Ring Road"}]},
    )

    item = preflight.check_requests("x", [GOOD], use_ai=True).items[0]

    assert item.issues == []
    assert item.suggested_title is None


@pytest.mark.parametrize("reply", [ValueError("not JSON"), ["a", "list"], {"results": "nope"}, {}])
def test_a_failed_model_call_falls_back_to_the_rules(monkeypatch, reply):
    fake_model(monkeypatch, reply)

    result = preflight.check_requests("x", [GOOD, WHY], use_ai=True)

    assert result.ai_used is False
    assert [[issue.code for issue in item.issues] for item in result.items] == [[], ["QUESTION_NOT_RECORD"]]


def test_only_inspection_requests_skip_the_model(monkeypatch):
    fake_model(monkeypatch, ValueError("must not be called"))

    result = preflight.check_requests("x", [INSPECT], use_ai=True)

    assert result.ai_used is False
    assert result.items[0].issues == []


def test_issues_are_capped_per_request(monkeypatch):
    every = list(preflight.EXCUSES)
    fake_model(monkeypatch, {"results": [{"id": "RQ-001", "issues": every, "rewrite": None}]})

    item = preflight.check_requests("x", [GOOD], use_ai=True).items[0]

    assert len(item.issues) == preflight.MAX_ISSUES


# --- the endpoint ---------------------------------------------------------------------------


def test_preflight_endpoint_returns_the_rules_result(client, case_id):
    body = {"requests": [GOOD.model_dump(by_alias=True), WHY.model_dump(by_alias=True)]}

    response = client.post(f"/cases/{case_id}/preflight", json=body)

    assert response.status_code == 200
    payload = response.json()
    assert payload["aiUsed"] is False
    assert payload["items"][0] == {"requestId": "RQ-001", "issues": []}
    assert payload["items"][1]["requestId"] == "RQ-002"
    assert payload["items"][1]["issues"][0]["code"] == "QUESTION_NOT_RECORD"
    assert set(payload["items"][1]["issues"][0]) == {"code", "officerSays", "why", "section", "fix"}


def stored_requests(engine, case_id):
    with Session(engine) as session:
        case = case_store.get_case(UUID(case_id), session=session)
        return case_store.load_requests(case, session=session)


def test_preflight_endpoint_does_not_store_anything(client, case_id, db_engine):
    client.post(f"/cases/{case_id}/preflight", json={"requests": [WHY.model_dump(by_alias=True)]})

    assert stored_requests(db_engine, case_id) == []


def test_preflight_endpoint_rejects_an_unknown_case(client):
    response = client.post("/cases/00000000-0000-0000-0000-000000000000/preflight", json={"requests": []})

    assert response.status_code == 404


def test_an_inspection_request_can_be_drafted_and_stored(client, case_id, db_engine):
    body = {"requests": [INSPECT.model_dump(by_alias=True)], "language": "en"}

    response = client.post(f"/cases/{case_id}/draft", json=body)

    assert response.status_code == 200
    assert "Section 2(j)(i)" in response.json()["draftText"]
    assert stored_requests(db_engine, case_id)[0].source == "inspection"


def test_the_draft_prompt_keeps_inspection_requests_as_they_are():
    from app.services.drafting.real import DRAFT_SYSTEM_PROMPT

    assert "Section 2(j)" in DRAFT_SYSTEM_PROMPT
    DRAFT_SYSTEM_PROMPT.format(count=1, language="Write in English.")  # still a valid template
