"""What the API writes to the database through the drafting flow: the case row and its requests."""

from uuid import UUID, uuid4

import pytest
from corpus_support import database_session
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import case_store, db
from app.main import app
from app.models import Case, CaseRequest
from app.schemas import InformationRequest

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


# --- the requests -----------------------------------------------------------------------------


def stored_requests(db_engine, case_id: str) -> list[InformationRequest]:
    case = stored_case(db_engine, case_id)
    with Session(db_engine) as session:
        return case_store.load_requests(case, session=session)


def as_requests(items: list[dict]) -> list[InformationRequest]:
    return [InformationRequest.model_validate(item) for item in items]


def check(client, case_id: str, requests: list[dict]):
    return client.post(f"/cases/{case_id}/public-info-check", json={"requests": requests})


def draft(client, case_id: str, requests: list[dict]):
    return client.post(f"/cases/{case_id}/draft", json={"requests": requests})


def test_decompose_stores_the_requests_it_returns(client, db_engine, case_id):
    returned = decompose(client, case_id)

    assert len(returned) == 3
    assert stored_requests(db_engine, case_id) == as_requests(returned)


def test_decompose_again_replaces_the_requests(client, db_engine, case_id):
    first = decompose(client, case_id, {"period": "Last 6 months"})
    second = decompose(client, case_id, {"period": "Last 1 year"})

    stored = stored_requests(db_engine, case_id)
    assert len(stored) == len(first) == len(second)
    assert {request.period for request in stored} == {"Last 1 year"}


def test_public_info_check_stores_what_was_found_and_where(client, db_engine, case_id):
    checked = check(client, case_id, decompose(client, case_id)).json()

    stored = stored_requests(db_engine, case_id)
    assert stored == as_requests(checked)
    by_id = {request.id: request for request in stored}
    assert by_id["RQ-001"].publicly_available is True
    assert by_id["RQ-001"].public_source.url == "https://eprocure.gov.in/cppp/"
    assert by_id["RQ-002"].publicly_available is False
    assert by_id["RQ-002"].public_source is None


def test_public_info_check_stores_exactly_the_requests_it_was_given(client, db_engine, case_id):
    requests = decompose(client, case_id)

    assert check(client, case_id, requests[:2]).status_code == 200

    assert [request.id for request in stored_requests(db_engine, case_id)] == ["RQ-001", "RQ-002"]


def test_draft_stores_the_requests_it_was_built_from(client, db_engine, case_id):
    requests = check(client, case_id, decompose(client, case_id)).json()
    requests[0]["context"] = "Earlier reply left this out."
    requests[1]["title"] = "Details of the amount spent on repairing the road outside my house"
    requests.append(
        {
            "id": "RQ-004",
            "category": "Custom",
            "title": "Name of the contractor who carried out the repair",
            "authority": "PWD, Govt of NCT of Delhi",
            "period": "Last 6 months",
            "quality": "good",
            "source": "custom",
        }
    )

    assert draft(client, case_id, requests).status_code == 200

    stored = stored_requests(db_engine, case_id)
    assert stored == as_requests(requests)
    assert stored[0].context == "Earlier reply left this out."
    assert stored[0].publicly_available is True  # what the check found is kept


def test_the_whole_flow_leaves_the_case_and_its_requests_stored(client, db_engine):
    case_id = client.post("/cases", json={"grievanceText": GRIEVANCE}).json()["caseId"]
    requests = decompose(client, case_id, {"period": "Last 6 months"})
    checked = check(client, case_id, requests).json()
    assert draft(client, case_id, checked).status_code == 200

    case = stored_case(db_engine, case_id)
    assert (case.status, case.clarification) == ("DRAFT_READY", {"period": "Last 6 months"})
    assert stored_requests(db_engine, case_id) == as_requests(checked)


@pytest.mark.parametrize("route", [check, draft])
def test_requests_with_a_repeated_id_are_refused(client, db_engine, case_id, route):
    requests = decompose(client, case_id)

    response = route(client, case_id, [requests[0], requests[1], requests[1]])

    assert response.status_code == 422
    assert "RQ-002" in response.json()["detail"]
    assert stored_requests(db_engine, case_id) == as_requests(requests)  # what was there is untouched


@pytest.mark.parametrize("route", [check, draft])
def test_a_value_longer_than_its_column_is_refused(client, db_engine, case_id, route):
    requests = decompose(client, case_id)
    requests[0]["category"] = "c" * 81

    response = route(client, case_id, requests)

    assert response.status_code == 422
    assert "category is 81 characters" in response.json()["detail"]
    assert stored_requests(db_engine, case_id)[0].category == "Work order"


def test_a_refused_draft_does_not_mark_the_case_draft_ready(client, db_engine, case_id):
    requests = decompose(client, case_id)
    requests[1]["id"] = requests[0]["id"]

    assert draft(client, case_id, requests).status_code == 422

    assert stored_case(db_engine, case_id).status == "REQUESTS_GENERATED"


def test_a_refused_decompose_changes_nothing(client, db_engine, case_id):
    response = client.post(f"/cases/{case_id}/decompose", json={"clarification": {"period": "p" * 81}})

    assert response.status_code == 422
    assert "period is 81 characters" in response.json()["detail"]
    case = stored_case(db_engine, case_id)
    assert (case.status, case.clarification) == ("GRIEVANCE_CAPTURED", {})
    assert stored_requests(db_engine, case_id) == []


def test_an_unknown_case_stores_no_requests(client, db_engine):
    requests = decompose(client, client.post("/cases", json={"grievanceText": GRIEVANCE}).json()["caseId"])

    assert check(client, str(uuid4()), requests).status_code == 404
    assert draft(client, str(uuid4()), requests).status_code == 404

    with Session(db_engine) as session:
        assert session.scalar(select(func.count()).select_from(CaseRequest)) == len(requests)


# --- the same on PostgreSQL (skipped without TEST_DATABASE_URL) ------------------------------


@pytest.fixture
def postgres_app(monkeypatch):
    """The app on a scratch schema of a real PostgreSQL database: its client and its engine."""
    with database_session("postgres") as session:
        engine = session.get_bind()
        monkeypatch.setattr(db, "get_engine", lambda: engine)
        yield TestClient(app), engine


def test_the_whole_flow_on_postgres(postgres_app):
    client, engine = postgres_app
    case_id = client.post("/cases", json={"grievanceText": GRIEVANCE}).json()["caseId"]

    clarification = {"period": "Last 6 months", "location": "Lajpat Nagar – दिल्ली"}
    requests = decompose(client, case_id, clarification)
    checked = check(client, case_id, requests).json()
    assert draft(client, case_id, checked).status_code == 200

    case = stored_case(engine, case_id)
    assert case.status == "DRAFT_READY"
    assert case.clarification == clarification
    stored = stored_requests(engine, case_id)
    assert stored == as_requests(checked)
    assert stored[0].public_source.url == "https://eprocure.gov.in/cppp/"


@pytest.mark.parametrize(("field", "limit"), [("id", 40), ("category", 80), ("period", 80)])
def test_a_value_too_long_for_its_column_is_a_422_not_a_database_error(postgres_app, field, limit):
    """Without the check in save_requests, PostgreSQL would refuse the value (SQLite never does)."""
    client, engine = postgres_app
    case_id = client.post("/cases", json={"grievanceText": GRIEVANCE}).json()["caseId"]
    requests = decompose(client, case_id)
    requests[0][field] = "x" * (limit + 1)

    assert draft(client, case_id, requests).status_code == 422

    assert stored_case(engine, case_id).status == "REQUESTS_GENERATED"
    assert [request.id for request in stored_requests(engine, case_id)] == ["RQ-001", "RQ-002", "RQ-003"]
