from corpus_support import add_source, database_session, make_pdf
from sqlalchemy import select

from app.models import Document, Passage, Source
from app.schemas import InformationRequest
from app.services import public_info

REQUEST = InformationRequest(
    id="RQ-001",
    category="Fee",
    title="What is the prescribed RTI application fee for Govt of NCT of Delhi",
    authority="PWD",
    period="Last 1 year",
    quality="good",
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
