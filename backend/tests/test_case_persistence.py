"""What the API writes to the database: the case row, through every step of the drafting flow."""

from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Case

GRIEVANCE = "Potholes on my street have not been repaired."


def stored_case(db_engine, case_id: str) -> Case | None:
    with Session(db_engine) as session:
        return session.get(Case, UUID(case_id))


def decompose(client, case_id: str, clarification: dict[str, str] | None = None) -> list[dict]:
    response = client.post(f"/cases/{case_id}/decompose", json={"clarification": clarification or {}})
    assert response.status_code == 200
    return response.json()


def test_a_created_case_is_stored(client, db_engine):
    response = client.post("/cases", json={"grievanceText": GRIEVANCE})

    case = stored_case(db_engine, response.json()["caseId"])
    assert case is not None
    assert case.grievance_text == GRIEVANCE
    assert case.status == "GRIEVANCE_CAPTURED"
    assert case.clarification == {}


def test_a_rejected_case_is_not_stored(client, db_engine):
    assert client.post("/cases", json={"grievanceText": "road"}).status_code == 422

    with Session(db_engine) as session:
        assert session.scalar(select(func.count()).select_from(Case)) == 0


def test_decompose_stores_the_clarification_and_moves_the_case_on(client, db_engine, case_id):
    decompose(client, case_id, {"period": "Last 6 months", "location": "Lajpat Nagar"})

    case = stored_case(db_engine, case_id)
    assert case.status == "REQUESTS_GENERATED"
    assert case.clarification == {"period": "Last 6 months", "location": "Lajpat Nagar"}


def test_decompose_again_replaces_the_clarification(client, db_engine, case_id):
    decompose(client, case_id, {"period": "Last 6 months", "location": "Lajpat Nagar"})
    decompose(client, case_id, {"period": "Last 1 year"})

    assert stored_case(db_engine, case_id).clarification == {"period": "Last 1 year"}


def test_public_info_check_leaves_the_status_alone(client, db_engine, case_id):
    requests = decompose(client, case_id)

    assert client.post(f"/cases/{case_id}/public-info-check", json={"requests": requests}).status_code == 200

    assert stored_case(db_engine, case_id).status == "REQUESTS_GENERATED"


def test_draft_marks_the_draft_ready(client, db_engine, case_id):
    requests = decompose(client, case_id, {"period": "Last 6 months"})

    assert client.post(f"/cases/{case_id}/draft", json={"requests": requests}).status_code == 200

    case = stored_case(db_engine, case_id)
    assert case.status == "DRAFT_READY"
    assert case.clarification == {"period": "Last 6 months"}  # drafting does not undo earlier steps


@pytest.mark.parametrize("route", ["decompose", "public-info-check", "draft"])
def test_an_unknown_case_changes_nothing(client, db_engine, route):
    body = {"clarification": {}} if route == "decompose" else {"requests": []}

    assert client.post(f"/cases/{uuid4()}/{route}", json=body).status_code == 404

    with Session(db_engine) as session:
        assert session.scalar(select(func.count()).select_from(Case)) == 0
