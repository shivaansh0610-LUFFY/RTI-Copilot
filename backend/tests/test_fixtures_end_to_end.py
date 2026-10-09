"""Runs each seed grievance through the whole pipeline: create case -> decompose
-> public-info-check -> draft. Uses the deterministic mock decomposition (the
"fake LLM"), not a real API call, so this stays fast and offline.
"""

import json
from pathlib import Path

import pytest

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "grievances.json").read_text())


@pytest.mark.parametrize("grievance", FIXTURES, ids=[g["id"] for g in FIXTURES])
def test_describe_to_draft(client, grievance):
    case_response = client.post("/cases", json={"grievanceText": grievance["grievance_text"]})
    assert case_response.status_code == 201
    case_id = case_response.json()["caseId"]

    decompose_response = client.post(
        f"/cases/{case_id}/decompose", json={"clarification": grievance["clarification"]}
    )
    assert decompose_response.status_code == 200
    requests = decompose_response.json()
    assert len(requests) > 0

    public_check_response = client.post(f"/cases/{case_id}/public-info-check", json={"requests": requests})
    assert public_check_response.status_code == 200
    checked_requests = public_check_response.json()

    draft_response = client.post(f"/cases/{case_id}/draft", json={"requests": checked_requests})
    assert draft_response.status_code == 200
    body = draft_response.json()
    assert body["draftText"]
    assert body["charCount"] == len(body["draftText"])
    assert isinstance(body["overLimit"], bool)
    assert isinstance(body["flaggedRequestIds"], list)
