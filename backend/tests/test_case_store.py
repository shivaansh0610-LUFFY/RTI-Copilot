"""The case repository (app.case_store), on SQLite and, with TEST_DATABASE_URL set, PostgreSQL."""

from uuid import UUID, uuid4

import pytest
from corpus_support import database_session

from app import case_store

KINDS = ["sqlite", "postgres"]
GRIEVANCE = "The road outside my house has been broken for two years."


@pytest.fixture(params=KINDS)
def session(request):
    with database_session(request.param) as db_session:
        yield db_session


def reload(session, case_id):
    """The case as the database has it, not as the session remembers it."""
    session.expire_all()
    return case_store.get_case(case_id, session=session)


def test_a_new_case_starts_captured_with_an_empty_clarification(session):
    case = case_store.create_case(GRIEVANCE, session=session)

    assert isinstance(case.id, UUID)
    assert case.grievance_text == GRIEVANCE
    assert case.status == case_store.GRIEVANCE_CAPTURED == "GRIEVANCE_CAPTURED"
    assert case.clarification == {}


def test_a_new_case_is_committed(session):
    case = case_store.create_case(GRIEVANCE, session=session)
    case_id = case.id

    session.rollback()  # throws away anything that was not committed

    stored = reload(session, case_id)
    assert stored is not None
    assert stored.grievance_text == GRIEVANCE
    assert stored.status == "GRIEVANCE_CAPTURED"


def test_every_case_gets_its_own_id(session):
    first = case_store.create_case(GRIEVANCE, session=session)
    second = case_store.create_case(GRIEVANCE, session=session)

    assert first.id != second.id
    assert reload(session, first.id).id == first.id
    assert reload(session, second.id).id == second.id


def test_an_unknown_case_is_none(session):
    assert case_store.get_case(uuid4(), session=session) is None


def test_the_clarification_and_status_are_updated_and_committed(session):
    case = case_store.create_case(GRIEVANCE, session=session)
    case_id = case.id

    result = case_store.update_case(
        case,
        session=session,
        clarification={"period": "Last 6 months", "location": "Lajpat Nagar – दिल्ली"},
        status=case_store.REQUESTS_GENERATED,
    )
    session.rollback()

    assert result is case
    stored = reload(session, case_id)
    assert stored.status == "REQUESTS_GENERATED"
    assert stored.clarification == {"period": "Last 6 months", "location": "Lajpat Nagar – दिल्ली"}


def test_a_field_left_out_is_not_changed(session):
    case = case_store.create_case(GRIEVANCE, session=session)
    case_store.update_case(case, session=session, clarification={"period": "Last 1 year"})
    case_store.update_case(case, session=session, status=case_store.DRAFT_READY)

    stored = reload(session, case.id)
    assert stored.clarification == {"period": "Last 1 year"}
    assert stored.status == "DRAFT_READY"

    case_store.update_case(stored, session=session)  # nothing to change
    assert reload(session, case.id).clarification == {"period": "Last 1 year"}


def test_an_empty_clarification_clears_it(session):
    case = case_store.create_case(GRIEVANCE, session=session)
    case_store.update_case(case, session=session, clarification={"period": "Last 1 year"})

    case_store.update_case(case, session=session, clarification={})

    assert reload(session, case.id).clarification == {}


def test_without_commit_the_changes_wait_for_the_caller(session):
    case = case_store.create_case(GRIEVANCE, session=session)

    case_store.update_case(
        case, session=session, clarification={"period": "Last 1 year"}, status=case_store.DRAFT_READY, commit=False
    )
    assert case.status == "DRAFT_READY"  # the session sees it ...

    session.rollback()  # ... but nothing was committed

    stored = reload(session, case.id)
    assert stored.status == "GRIEVANCE_CAPTURED"
    assert stored.clarification == {}


def test_without_commit_the_changes_are_kept_once_the_caller_commits(session):
    case = case_store.create_case(GRIEVANCE, session=session)

    case_store.update_case(case, session=session, status=case_store.REQUESTS_GENERATED, commit=False)
    session.commit()

    assert reload(session, case.id).status == "REQUESTS_GENERATED"


def test_the_stages_are_the_ones_the_api_documents():
    assert (case_store.GRIEVANCE_CAPTURED, case_store.REQUESTS_GENERATED, case_store.DRAFT_READY) == (
        "GRIEVANCE_CAPTURED",
        "REQUESTS_GENERATED",
        "DRAFT_READY",
    )
