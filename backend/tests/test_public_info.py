import pytest
from corpus_support import add_source, database_session, make_pdf
from sqlalchemy import select

from app.models import Document, Passage, Source
from app.schemas import InformationRequest
from app.services import live_fetch, public_info
from app.services.live_sources import LiveSource
from app.services.pwd_road_projects import RoadProject


@pytest.fixture(autouse=True)
def _no_live_road_projects_by_default(monkeypatch):
    """Every test below exercises other logic; without this, each one would make a real
    network call to the live PWD road-projects feed. Tests that specifically cover that
    path override this stub themselves."""

    def unreachable():
        raise public_info.pwd_road_projects.RoadProjectsFetchError("not called in this test")

    monkeypatch.setattr(public_info.pwd_road_projects, "fetch_road_projects", unreachable)

REQUEST = InformationRequest(
    id="RQ-001",
    category="Fee",
    title="What is the prescribed RTI application fee for Govt of NCT of Delhi",
    authority="PWD",
    period="Last 1 year",
    quality="good",
)

STATUS_REQUEST = InformationRequest(
    id="RQ-002",
    category="Status",
    title="Current status of my complaint about this pothole",
    authority="PWD",
    period="Last 1 year",
    quality="good",
)

PGC_SOURCE = LiveSource(
    title="PGC Cause List",
    url="https://pgc.delhi.gov.in/pgc-cause-list-annexure-2",
    publishes="x",
    update_frequency="x",
    limits="x",
    verified_at="2026-01-01T00:00:00Z",
)


def stub_keyword_statement(monkeypatch, passage_ids_by_tsquery: dict[str, list]):
    """Replaces the real (PostgreSQL-only) keyword_statement with a SQLite-compatible one,
    so the glue logic in public_info.py (not the search SQL itself) is tested here."""

    def fake(tsquery, limit):
        return select(Passage.id).where(Passage.id.in_(passage_ids_by_tsquery.get(tsquery, [])))

    monkeypatch.setattr(public_info, "keyword_statement", fake)


# --- glue logic, on SQLite (the real search SQL is tested against PostgreSQL below) -----------


def test_a_keyword_match_is_marked_public_with_its_source(monkeypatch, tmp_path):
    with database_session("sqlite") as session:
        source = add_source(session, tmp_path, "rules.pdf", make_pdf([["x"]]), title="RTI Rules, 2012")
        document = Document(source_id=source.id, kind="corpus", filename="rules.pdf", page_count=1)
        session.add(document)
        session.flush()
        passage = Passage(document_id=document.id, page=1, paragraph=1, text="The fee is Rs. 10/-")
        session.add(passage)
        session.commit()

        tsquery = public_info.build_tsquery(REQUEST.title)
        stub_keyword_statement(monkeypatch, {tsquery: [passage.id]})

        result = public_info.check_public_info([REQUEST], session=session)[0]

        assert result.publicly_available is True
        assert result.public_source.title == "RTI Rules, 2012"
        assert result.public_source.url == source.url


def test_no_keyword_match_leaves_the_request_unmarked(monkeypatch):
    with database_session("sqlite") as session:
        stub_keyword_statement(monkeypatch, {})

        result = public_info.check_public_info([REQUEST], session=session)[0]

        assert result.publicly_available is False
        assert result.public_source is None


def test_a_title_with_no_words_is_never_marked_public(monkeypatch):
    with database_session("sqlite") as session:
        # Any match at all would be wrong here, so the stub must never even be asked.
        def refuse(tsquery, limit):
            raise AssertionError("searched for a title with no words")

        monkeypatch.setattr(public_info, "keyword_statement", refuse)

        blank = REQUEST.model_copy(update={"title": "???"})
        result = public_info.check_public_info([blank], session=session)[0]

        assert result.publicly_available is False


def test_a_passage_with_no_traceable_source_is_not_marked_public(monkeypatch):
    """A document with no source_id (e.g. an uploaded RTI reply, not corpus) must never be
    cited as a "public source" even if it somehow matched."""
    with database_session("sqlite") as session:
        document = Document(source_id=None, kind="response", filename="reply.pdf", page_count=1)
        session.add(document)
        session.flush()
        passage = Passage(document_id=document.id, page=1, paragraph=1, text="unrelated")
        session.add(passage)
        session.commit()

        tsquery = public_info.build_tsquery(REQUEST.title)
        stub_keyword_statement(monkeypatch, {tsquery: [passage.id]})

        result = public_info.check_public_info([REQUEST], session=session)[0]

        assert result.publicly_available is False
        assert result.public_source is None


def test_requests_without_a_match_keep_their_other_fields(monkeypatch):
    with database_session("sqlite") as session:
        stub_keyword_statement(monkeypatch, {})

        result = public_info.check_public_info([REQUEST], session=session)[0]

        assert result.id == REQUEST.id
        assert result.title == REQUEST.title


# --- status requests: checked live against data/live_sources.csv, not the static corpus -------


def test_a_status_request_with_a_pwd_row_in_the_live_source_is_marked_public(monkeypatch):
    monkeypatch.setattr(public_info.live_sources, "load_live_sources", lambda: [PGC_SOURCE])
    monkeypatch.setattr(
        public_info.live_fetch, "fetch_live_text", lambda url: "Diary No | Public Works | Disposed of"
    )

    result = public_info.check_public_info([STATUS_REQUEST])[0]

    assert result.publicly_available is True
    assert result.public_source.title == "PGC Cause List"
    assert result.public_source.url == PGC_SOURCE.url


def test_a_status_request_with_no_pwd_row_is_left_unmarked(monkeypatch):
    monkeypatch.setattr(public_info.live_sources, "load_live_sources", lambda: [PGC_SOURCE])
    monkeypatch.setattr(public_info.live_fetch, "fetch_live_text", lambda url: "Diary No | Health | Disposed of")

    result = public_info.check_public_info([STATUS_REQUEST])[0]

    assert result.publicly_available is False
    assert result.public_source is None


def test_a_pwd_mention_outside_a_table_row_does_not_count(monkeypatch):
    """live_sources.md: match on a table-row line, never anywhere else on the page (e.g. a
    menu that happens to say "Public Works Department" is not evidence of a live case)."""
    monkeypatch.setattr(public_info.live_sources, "load_live_sources", lambda: [PGC_SOURCE])
    monkeypatch.setattr(
        public_info.live_fetch, "fetch_live_text", lambda url: "Public Works Department\nDiary No | Health | Pending"
    )

    result = public_info.check_public_info([STATUS_REQUEST])[0]

    assert result.publicly_available is False


def test_an_unreachable_live_source_is_skipped_not_raised(monkeypatch):
    def raise_fetch_error(url):
        raise live_fetch.LiveFetchError(url, "timed out")

    monkeypatch.setattr(public_info.live_sources, "load_live_sources", lambda: [PGC_SOURCE])
    monkeypatch.setattr(public_info.live_fetch, "fetch_live_text", raise_fetch_error)

    result = public_info.check_public_info([STATUS_REQUEST])[0]

    assert result.publicly_available is False
    assert result.public_source is None


def test_a_status_request_checks_the_next_source_after_one_fails(monkeypatch):
    other_source = LiveSource(
        title="Other",
        url="https://example.gov.in/other",
        publishes="x",
        update_frequency="x",
        limits="x",
        verified_at="2026-01-01T00:00:00Z",
    )

    def fetch(url):
        if url == PGC_SOURCE.url:
            raise live_fetch.LiveFetchError(url, "timed out")
        return "Diary No | Public Works | Disposed of"

    monkeypatch.setattr(public_info.live_sources, "load_live_sources", lambda: [PGC_SOURCE, other_source])
    monkeypatch.setattr(public_info.live_fetch, "fetch_live_text", fetch)

    result = public_info.check_public_info([STATUS_REQUEST])[0]

    assert result.publicly_available is True
    assert result.public_source.title == "Other"


def test_a_status_request_never_queries_the_static_corpus(monkeypatch):
    def refuse(tsquery, limit):
        raise AssertionError("a status request must not fall back to the static corpus")

    monkeypatch.setattr(public_info, "keyword_statement", refuse)
    monkeypatch.setattr(public_info.live_sources, "load_live_sources", lambda: [])

    with database_session("sqlite") as session:
        result = public_info.check_public_info([STATUS_REQUEST], session=session)[0]

    assert result.publicly_available is False


# --- records requests: checked live against the PWD road-projects feed, before the corpus -----


def test_a_records_request_matching_a_live_project_is_marked_public(monkeypatch):
    project = RoadProject(
        id=138317,
        name=(
            "A/R & M/O to various roads under PWD Division South East Road-2 during 2026-27 "
            "(SH: Providing manholes and bellmouths on Guru Ravidass Road of Sub Division 24 "
            "under South East Road-2)."
        ),
        status="working",
        tender_status="awarded",
    )
    monkeypatch.setattr(public_info.pwd_road_projects, "fetch_road_projects", lambda: [project])

    request = REQUEST.model_copy(update={"title": "Manholes on Guru Ravidass Road"})
    result = public_info.check_public_info([request])[0]

    assert result.publicly_available is True
    # The API record itself refuses direct browser navigation, so the link goes to the real,
    # browsable search page; the matched project's own name is still quoted in the title.
    assert result.public_source.url == public_info.pwd_road_projects.SOURCE_PAGE_URL
    assert result.public_source.title.startswith("PWD Delhi Work Report (live): A/R & M/O")


def test_a_records_request_not_in_the_live_feed_falls_back_to_the_corpus(monkeypatch):
    project = RoadProject(id=1, name="Guru Ravidass Road works", status="working", tender_status="awarded")
    monkeypatch.setattr(public_info.pwd_road_projects, "fetch_road_projects", lambda: [project])
    with database_session("sqlite") as session:
        stub_keyword_statement(monkeypatch, {})

        result = public_info.check_public_info([REQUEST], session=session)[0]

        assert result.publicly_available is False


def test_an_unreachable_road_projects_feed_falls_back_to_the_corpus(monkeypatch):
    with database_session("sqlite") as session:
        stub_keyword_statement(monkeypatch, {})
        # _no_live_road_projects_by_default already makes the feed raise; this just
        # documents that the fallback still runs rather than crashing the request.

        result = public_info.check_public_info([REQUEST], session=session)[0]

        assert result.publicly_available is False


# --- the real search, on PostgreSQL -------------------------------------------------------------


def test_an_exact_match_in_the_corpus_is_found_on_a_real_database(tmp_path):
    with database_session("postgres") as session:
        source = add_source(session, tmp_path, "rules.pdf", make_pdf([["x"]]), title="RTI Rules, 2012")
        document = Document(source_id=source.id, kind="corpus", filename="rules.pdf", page_count=1)
        session.add(document)
        session.flush()
        session.add(
            Passage(
                document_id=document.id,
                page=1,
                paragraph=1,
                # build_tsquery ANDs every word of the request title, so a real match needs all
                # of them present, not just the general topic -- this is the strict behavior the
                # conservative design intends, not something to work around.
                text="The prescribed RTI application fee for Govt of NCT of Delhi is Rs. 10/-.",
            )
        )
        session.commit()

        result = public_info.check_public_info([REQUEST], session=session)[0]

        assert result.publicly_available is True
        assert result.public_source.title == "RTI Rules, 2012"


def test_a_citizen_specific_record_is_not_falsely_marked_public_on_a_real_database(tmp_path):
    """The corpus holds procedure and law, never a specific citizen's case record, so a
    request for one must come back unmarked almost always -- this is the safe default, not
    a bug: it means the citizen still files the RTI instead of being wrongly told not to."""
    with database_session("postgres") as session:
        source = add_source(session, tmp_path, "rules.pdf", make_pdf([["x"]]), title="RTI Rules, 2012")
        document = Document(source_id=source.id, kind="corpus", filename="rules.pdf", page_count=1)
        session.add(document)
        session.flush()
        session.add(
            Passage(document_id=document.id, page=1, paragraph=1, text="Non-BPL applicants must pay a fee.")
        )
        session.commit()

        specific_request = REQUEST.model_copy(
            update={"title": "Copy of the work order sanctioning repair of the road outside my house"}
        )
        result = public_info.check_public_info([specific_request], session=session)[0]

        assert result.publicly_available is False
