"""Saving and loading a case's information requests (app.case_store), on SQLite and, with
TEST_DATABASE_URL set, PostgreSQL."""

import pytest
from corpus_support import database_session
from sqlalchemy import delete, func, select

from app import case_store
from app.models import Case, CaseRequest
from app.schemas import InformationRequest, PublicSource

KINDS = ["sqlite", "postgres"]
GRIEVANCE = "The road outside my house has been broken for two years."


@pytest.fixture(params=KINDS)
def session(request):
    with database_session(request.param) as db_session:
        yield db_session


@pytest.fixture
def case(session):
    return case_store.create_case(GRIEVANCE, session=session)


def make_request(rq_id: str = "RQ-001", **fields) -> InformationRequest:
    values = {
        "id": rq_id,
        "category": "Work order",
        "title": "Copy of the work order sanctioning repair of the road",
        "authority": "PWD, Govt of NCT of Delhi",
        "period": "Last 6 months",
        "quality": "good",
    } | fields
    return InformationRequest(**values)


def rows(session, case) -> dict[str, CaseRequest]:
    """The stored rows by request id, read afresh from the database."""
    session.expire_all()
    found = session.scalars(select(CaseRequest).where(CaseRequest.case_id == case.id)).all()
    return {row.rq_id: row for row in found}


# --- the mapping --------------------------------------------------------------------------


def test_a_request_with_only_the_required_fields_round_trips(session, case):
    request = make_request()

    case_store.save_requests(case, [request], session=session)
    session.rollback()

    assert case_store.load_requests(case, session=session) == [request]


def test_every_field_round_trips(session, case):
    request = make_request(
        "FU-RQ-002",
        category="Expenditure",
        title="Details of amount spent on repair of the road outside house no. 12, Lajpat Nagar – दिल्ली",
        quality="needs-detail",
        source="follow-up",
        context="The earlier reply left this out.",
        publicly_available=True,
        public_source=PublicSource(title="CPWD Works Manual 2024", url="https://cpwd.gov.in/manual.pdf"),
    )

    case_store.save_requests(case, [request], session=session)
    session.rollback()

    assert case_store.load_requests(case, session=session) == [request]


def test_the_columns_hold_what_the_model_documents(session, case):
    found = make_request(
        "RQ-001",
        source="generated",
        context="Why it is asked",
        publicly_available=True,
        public_source=PublicSource(title="RTI Rules, 2012", url="https://example.gov.in/rules.pdf"),
    )
    case_store.save_requests(case, [found], session=session)

    row = rows(session, case)["RQ-001"]
    assert row.case_id == case.id
    assert (row.category, row.authority, row.period, row.quality) == (
        found.category,
        found.authority,
        found.period,
        "good",
    )
    assert (row.source, row.context) == ("generated", "Why it is asked")
    assert row.public_status == "already_public"
    assert row.public_source_title == "RTI Rules, 2012"
    assert row.public_source_url == "https://example.gov.in/rules.pdf"


@pytest.mark.parametrize(
    ("publicly_available", "status"), [(True, "already_public"), (False, "not_found"), (None, None)]
)
def test_public_availability_is_stored_as_the_status(session, case, publicly_available, status):
    case_store.save_requests(case, [make_request(publicly_available=publicly_available)], session=session)

    row = rows(session, case)["RQ-001"]
    assert row.public_status == status
    assert case_store.load_requests(case, session=session)[0].publicly_available is publicly_available


@pytest.mark.parametrize("publicly_available", [False, None])
def test_where_a_request_was_found_is_only_kept_when_it_was_found(session, case, publicly_available):
    stray = PublicSource(title="Not a source", url="https://example.gov.in/x")
    case_store.save_requests(
        case, [make_request(publicly_available=publicly_available, public_source=stray)], session=session
    )

    row = rows(session, case)["RQ-001"]
    assert (row.public_source_title, row.public_source_url) == (None, None)
    assert case_store.load_requests(case, session=session)[0].public_source is None


def test_a_request_found_without_a_source_has_none(session, case):
    case_store.save_requests(case, [make_request(publicly_available=True)], session=session)

    loaded = case_store.load_requests(case, session=session)[0]
    assert loaded.publicly_available is True
    assert loaded.public_source is None


def test_unset_optional_fields_come_back_unset(session, case):
    case_store.save_requests(case, [make_request()], session=session)

    loaded = case_store.load_requests(case, session=session)[0]
    assert loaded.model_dump(exclude_none=True).keys() == {
        "id",
        "category",
        "title",
        "authority",
        "period",
        "quality",
    }


# --- replacing the stored requests ----------------------------------------------------------


def test_saving_again_replaces_what_was_stored(session, case):
    three = [make_request("RQ-001"), make_request("RQ-002"), make_request("RQ-003")]
    case_store.save_requests(case, three, session=session)

    retitled = make_request("RQ-002", title="A better title for this request, now longer")
    case_store.save_requests(case, [retitled, make_request("RQ-004")], session=session)

    loaded = case_store.load_requests(case, session=session)
    assert [request.id for request in loaded] == ["RQ-002", "RQ-004"]
    assert loaded[0].title == "A better title for this request, now longer"


def test_a_known_request_is_updated_in_place(session, case):
    case_store.save_requests(case, [make_request("RQ-001"), make_request("RQ-002")], session=session)
    before = {rq_id: row.id for rq_id, row in rows(session, case).items()}

    found = PublicSource(title="RTI Rules, 2012", url="https://example.gov.in/rules.pdf")
    checked = [
        make_request("RQ-001", publicly_available=True, public_source=found),
        make_request("RQ-002", publicly_available=False),
    ]
    case_store.save_requests(case, checked, session=session)

    after = rows(session, case)
    assert {rq_id: row.id for rq_id, row in after.items()} == before
    assert after["RQ-001"].public_status == "already_public"
    assert after["RQ-002"].public_status == "not_found"


def test_an_empty_list_clears_the_requests(session, case):
    case_store.save_requests(case, [make_request("RQ-001"), make_request("RQ-002")], session=session)

    case_store.save_requests(case, [], session=session)

    assert case_store.load_requests(case, session=session) == []
    assert rows(session, case) == {}


def test_saving_one_case_leaves_the_others_alone(session, case):
    other = case_store.create_case("Another grievance, about a different road.", session=session)
    theirs = make_request("RQ-001", title="The other case's request, in other words")
    case_store.save_requests(other, [theirs], session=session)

    case_store.save_requests(case, [make_request("RQ-001"), make_request("RQ-002")], session=session)
    case_store.save_requests(case, [], session=session)

    assert [request.title for request in case_store.load_requests(other, session=session)] == [
        "The other case's request, in other words"
    ]


def test_two_cases_can_use_the_same_request_id(session, case):
    other = case_store.create_case("Another grievance, about a different road.", session=session)

    case_store.save_requests(case, [make_request("RQ-001")], session=session)
    case_store.save_requests(other, [make_request("RQ-001")], session=session)

    assert session.scalar(select(func.count()).select_from(CaseRequest)) == 2


def test_deleting_a_case_deletes_its_requests(session, case):
    case_store.save_requests(case, [make_request("RQ-001"), make_request("RQ-002")], session=session)

    session.execute(delete(Case).where(Case.id == case.id))
    session.commit()

    assert session.scalar(select(func.count()).select_from(CaseRequest)) == 0


# --- loading ----------------------------------------------------------------------------------


def test_a_case_with_no_requests_loads_an_empty_list(session, case):
    assert case_store.load_requests(case, session=session) == []


def test_requests_load_ordered_by_the_numbers_in_their_ids(session, case):
    ids = ["RQ-10", "RQ-2", "FU-RQ-002", "RQ-1", "RQ-011"]
    case_store.save_requests(case, [make_request(rq_id) for rq_id in ids], session=session)

    loaded = case_store.load_requests(case, session=session)

    assert [request.id for request in loaded] == ["FU-RQ-002", "RQ-1", "RQ-2", "RQ-10", "RQ-011"]


# --- what is refused -------------------------------------------------------------------------


def test_a_repeated_id_is_refused_and_nothing_is_written(session, case):
    case_store.save_requests(case, [make_request("RQ-001")], session=session)

    repeats = [
        make_request("RQ-002"),
        make_request("RQ-001", title="Changed title for the request"),
        make_request("RQ-002"),
    ]
    with pytest.raises(case_store.InvalidRequests, match=r"RQ-002.*more than once"):
        case_store.save_requests(case, repeats, session=session)

    session.rollback()
    assert [(request.id, request.title) for request in case_store.load_requests(case, session=session)] == [
        ("RQ-001", make_request().title)
    ]


@pytest.mark.parametrize(("field", "limit"), [("id", 40), ("category", 80), ("period", 80)])
def test_the_longest_value_a_column_holds_is_stored_and_one_more_is_refused(session, case, field, limit):
    """On PostgreSQL the VARCHAR limit is real, so this shows the check matches the database: the
    longest value that fits is stored, and one character more is refused with a message instead of
    failing inside the database."""

    def request_with(value: str) -> InformationRequest:
        return make_request(value) if field == "id" else make_request(**{field: value})

    case_store.save_requests(case, [request_with("x" * limit)], session=session)
    assert len(case_store.load_requests(case, session=session)) == 1

    with pytest.raises(case_store.InvalidRequests, match=rf"{field} is {limit + 1} characters.*at most {limit}"):
        case_store.save_requests(case, [request_with("x" * (limit + 1))], session=session)


def test_a_value_that_is_too_long_is_refused_before_anything_changes(session, case):
    case_store.save_requests(case, [make_request("RQ-001")], session=session)

    too_long = [make_request("RQ-001"), make_request("RQ-002", category="c" * 81)]
    with pytest.raises(case_store.InvalidRequests, match=r"Request RQ-002: category"):
        case_store.save_requests(case, too_long, session=session)

    session.rollback()
    assert list(rows(session, case)) == ["RQ-001"]


# --- transactions ---------------------------------------------------------------------------


def test_saved_requests_are_committed(session, case):
    case_store.save_requests(case, [make_request("RQ-001")], session=session)

    session.rollback()

    assert list(rows(session, case)) == ["RQ-001"]


def test_without_commit_the_requests_wait_for_the_caller(session, case):
    case_store.save_requests(case, [make_request("RQ-001")], session=session)

    case_store.save_requests(case, [make_request("RQ-002")], session=session, commit=False)
    assert [request.id for request in case_store.load_requests(case, session=session)] == ["RQ-002"]

    session.rollback()

    assert list(rows(session, case)) == ["RQ-001"]
