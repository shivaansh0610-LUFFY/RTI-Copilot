import numpy as np
import pytest
from corpus_support import (
    add_source,
    clause,
    database_session,
    fake_embed,
    fake_embed_texts,
    forbid_real_model,
    make_pdf,
    use_fake_embeddings,
)
from sqlalchemy import func, select

from app.models import Document, Passage
from app.services import embeddings
from ingest import load_documents
from ingest.load_documents import load_all

# Page 1 holds two clauses too big to share a paragraph, page 2 one short clause, page 3 is blank.
ACT_PDF = make_pdf([[clause("a", 400), clause("b", 400)], ["(c) A short last clause."], []])
ACT_PARAGRAPHS = [(1, 1), (1, 2), (2, 1)]

MANUAL_HTML = b"""<html><body><nav>Home About Us</nav>
<h1>MANUAL - 5</h1>
<table><tr><td>3</td><td>CPWD Works Manual 2014</td></tr><tr><td>4</td><td>CPWD Maintenance Manual 2012</td></tr></table>
<footer>copyright Sparx IT</footer></body></html>"""


@pytest.fixture(autouse=True)
def fake_embeddings(monkeypatch):
    forbid_real_model(monkeypatch)
    use_fake_embeddings(monkeypatch)


@pytest.fixture
def embed_calls(monkeypatch):
    calls = []

    def record(texts, batch_size=32):
        calls.append(list(texts))
        return fake_embed_texts(texts)

    monkeypatch.setattr(embeddings, "embed_texts", record)
    return calls


@pytest.fixture
def session(request):
    """SQLite by default; a test marked with `both_databases` also runs on PostgreSQL if available."""
    with database_session(getattr(request, "param", "sqlite")) as db_session:
        yield db_session


both_databases = pytest.mark.parametrize("session", ["sqlite", "postgres"], indirect=True)


def count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model))


def passages_of(session, document) -> list[Passage]:
    statement = select(Passage).where(Passage.document_id == document.id).order_by(Passage.page, Passage.paragraph)
    return list(session.scalars(statement))


# --- ingesting a document ---------------------------------------------------------------------


@both_databases
def test_pdf_becomes_a_document_with_numbered_passages(session, tmp_path, embed_calls):
    source = add_source(session, tmp_path, "rti-act.pdf", ACT_PDF)

    [result] = load_all(session, tmp_path)

    assert result.ok, result.message
    assert result.url == source.url
    assert result.message == "ingested 3 passages from 3 pages"
    [document] = session.scalars(select(Document)).all()
    assert document.kind == "corpus"
    assert document.source_id == source.id
    assert document.case_id is None
    assert document.filename == "rti-act.pdf"
    assert document.page_count == 3
    assert document.ocr_used is False
    passages = passages_of(session, document)
    assert [(p.page, p.paragraph) for p in passages] == ACT_PARAGRAPHS
    assert passages[0].text.startswith("(a) ") and passages[1].text.startswith("(b) ")
    assert passages[2].text == "(c) A short last clause."


@both_databases
def test_every_passage_gets_its_embedding(session, tmp_path, embed_calls):
    add_source(session, tmp_path, "rti-act.pdf", ACT_PDF)

    load_all(session, tmp_path)

    passages = session.scalars(select(Passage).order_by(Passage.page, Passage.paragraph)).all()
    for passage in passages:
        assert len(passage.embedding) == 1024
        assert np.allclose(passage.embedding, fake_embed(passage.text), atol=1e-6)
        assert passage.tsv  # filled in by the database, not by the loader
    # All of a document's passages are embedded in one call, in page order.
    assert embed_calls == [[p.text for p in passages]]


def test_html_source_is_one_page_without_the_page_chrome(session, tmp_path):
    add_source(session, tmp_path, "manual-5.html", MANUAL_HTML, doc_type="disclosure")

    [result] = load_all(session, tmp_path)

    assert result.ok, result.message
    [document] = session.scalars(select(Document)).all()
    assert document.page_count == 1
    [passage] = passages_of(session, document)
    assert (passage.page, passage.paragraph) == (1, 1)
    assert "CPWD Works Manual 2014" in passage.text and "CPWD Maintenance Manual 2012" in passage.text
    assert "Home" not in passage.text and "Sparx" not in passage.text


def test_every_registered_source_is_ingested(session, tmp_path):
    add_source(session, tmp_path, "act.pdf", ACT_PDF, title="Act")
    add_source(session, tmp_path, "manual-5.html", MANUAL_HTML, title="Manual 5")

    results = load_all(session, tmp_path)

    assert [r.ok for r in results] == [True, True]
    assert {d.filename for d in session.scalars(select(Document))} == {"act.pdf", "manual-5.html"}
    assert count(session, Passage) == 4


def test_nothing_to_do_when_the_sources_table_is_empty(session, tmp_path):
    assert load_all(session, tmp_path) == []


# --- running it again -------------------------------------------------------------------------


@both_databases
def test_running_twice_does_not_duplicate_anything(session, tmp_path, embed_calls):
    add_source(session, tmp_path, "rti-act.pdf", ACT_PDF)

    first = load_all(session, tmp_path)
    second = load_all(session, tmp_path)

    assert first[0].ok and second[0].ok
    assert "already ingested (3 passages)" in second[0].message
    assert count(session, Document) == 1
    assert count(session, Passage) == 3
    assert len(embed_calls) == 1  # the second run neither extracted nor embedded anything


@both_databases
def test_force_replaces_the_document_and_its_passages(session, tmp_path, embed_calls):
    add_source(session, tmp_path, "rti-act.pdf", ACT_PDF)
    load_all(session, tmp_path)
    [old] = session.scalars(select(Document)).all()
    old_id, old_passage_ids = old.id, set(session.scalars(select(Passage.id)))

    [result] = load_all(session, tmp_path, force=True)

    assert result.ok and result.message == "ingested 3 passages from 3 pages"
    [new] = session.scalars(select(Document)).all()
    assert new.id != old_id
    assert count(session, Passage) == 3  # the old ones went with the old document
    assert not old_passage_ids & set(session.scalars(select(Passage.id)))
    assert [(p.page, p.paragraph) for p in passages_of(session, new)] == ACT_PARAGRAPHS


def test_new_sources_are_added_on_a_rerun_without_touching_old_ones(session, tmp_path):
    add_source(session, tmp_path, "act.pdf", ACT_PDF, title="Act")
    load_all(session, tmp_path)
    [act] = session.scalars(select(Document)).all()
    add_source(session, tmp_path, "manual-5.html", MANUAL_HTML, title="Manual 5")

    results = load_all(session, tmp_path)

    assert [r.ok for r in results] == [True, True]
    assert count(session, Document) == 2
    assert session.get(Document, act.id) is not None
    assert len(passages_of(session, act)) == 3


# --- sources that cannot be ingested ----------------------------------------------------------


def test_file_that_was_never_downloaded_is_reported(session, tmp_path):
    add_source(session, tmp_path, "act.pdf", ACT_PDF)
    (tmp_path / "data" / "corpus" / "act.pdf").unlink()

    [result] = load_all(session, tmp_path)

    assert not result.ok
    assert "has not been downloaded" in result.message and "register_sources" in result.message
    assert count(session, Document) == 0


def test_file_that_no_longer_matches_its_checksum_is_not_ingested(session, tmp_path):
    add_source(session, tmp_path, "act.pdf", ACT_PDF, checksum="0" * 64)

    [result] = load_all(session, tmp_path)

    assert not result.ok and "does not match the registered checksum" in result.message
    assert count(session, Document) == 0


def test_pdf_with_no_text_is_not_ingested(session, tmp_path):
    add_source(session, tmp_path, "blank.pdf", make_pdf([[], []]))

    [result] = load_all(session, tmp_path)

    assert not result.ok and "no extractable text" in result.message
    assert count(session, Document) == 0  # an empty document would count as "already ingested"


def test_unreadable_pdf_is_reported(session, tmp_path):
    add_source(session, tmp_path, "broken.pdf", b"%PDF-1.4 but not really")

    [result] = load_all(session, tmp_path)

    assert not result.ok and "broken.pdf" in result.message
    assert count(session, Document) == 0


def test_local_path_outside_the_corpus_folder_is_refused(session, tmp_path):
    add_source(session, tmp_path, "act.pdf", ACT_PDF, local_path="../outside.pdf")
    (tmp_path.parent / "outside.pdf").write_bytes(ACT_PDF)

    [result] = load_all(session, tmp_path)

    assert not result.ok and "data/corpus" in result.message
    assert count(session, Document) == 0


def test_one_failing_source_does_not_stop_the_others(session, tmp_path):
    add_source(session, tmp_path, "a-broken.pdf", b"not a pdf", title="A broken")
    add_source(session, tmp_path, "b-act.pdf", ACT_PDF, title="B act")

    results = load_all(session, tmp_path)

    assert [r.ok for r in results] == [False, True]
    assert [d.filename for d in session.scalars(select(Document))] == ["b-act.pdf"]


# --- all or nothing ---------------------------------------------------------------------------


@both_databases
def test_embedding_failure_leaves_nothing_behind_and_a_retry_works(session, tmp_path, monkeypatch):
    add_source(session, tmp_path, "act.pdf", ACT_PDF)
    monkeypatch.setattr(embeddings, "embed_texts", lambda texts, **kw: (_ for _ in ()).throw(RuntimeError("model down")))

    [failed] = load_all(session, tmp_path)

    assert not failed.ok and "model down" in failed.message
    assert count(session, Document) == 0 and count(session, Passage) == 0

    use_fake_embeddings(monkeypatch)
    [retried] = load_all(session, tmp_path)
    assert retried.ok and count(session, Passage) == 3


@both_databases
def test_failure_after_the_document_row_is_written_rolls_it_back(session, tmp_path, monkeypatch):
    add_source(session, tmp_path, "act.pdf", ACT_PDF)
    monkeypatch.setattr(embeddings, "embed_texts", lambda texts, **kw: fake_embed_texts(texts)[:-1])  # one short

    [result] = load_all(session, tmp_path)

    assert not result.ok
    assert count(session, Document) == 0 and count(session, Passage) == 0


@both_databases
def test_failed_force_keeps_the_existing_document(session, tmp_path, monkeypatch):
    add_source(session, tmp_path, "act.pdf", ACT_PDF)
    load_all(session, tmp_path)
    [old] = session.scalars(select(Document)).all()
    old_id = old.id
    (tmp_path / "data" / "corpus" / "act.pdf").write_bytes(b"altered")  # checksum no longer matches

    [result] = load_all(session, tmp_path, force=True)

    assert not result.ok
    assert [d.id for d in session.scalars(select(Document))] == [old_id]
    assert count(session, Passage) == 3


# --- the command line -------------------------------------------------------------------------


@pytest.fixture
def cli(session, tmp_path, monkeypatch):
    monkeypatch.setattr(load_documents, "get_engine", lambda: session.get_bind())
    monkeypatch.setattr(load_documents, "BACKEND_DIR", tmp_path)
    return load_documents.main


def test_cli_exits_zero_when_everything_is_ingested(cli, session, tmp_path, capsys):
    add_source(session, tmp_path, "act.pdf", ACT_PDF)

    assert cli([]) == 0

    output = capsys.readouterr().out
    assert "ingested 3 passages from 3 pages" in output and "1 of 1 sources OK." in output
    assert count(session, Passage) == 3


def test_cli_exits_one_when_a_source_fails(cli, session, tmp_path, capsys):
    add_source(session, tmp_path, "a-broken.pdf", b"not a pdf", title="A broken")
    add_source(session, tmp_path, "b-act.pdf", ACT_PDF, title="B act")

    assert cli([]) == 1

    output = capsys.readouterr().out
    assert "ERROR" in output and "1 of 2 sources OK." in output
    assert count(session, Passage) == 3  # the good one still went in


def test_cli_force_flag_reingests(cli, session, tmp_path, capsys):
    add_source(session, tmp_path, "act.pdf", ACT_PDF)
    cli([])
    capsys.readouterr()

    assert cli([]) == 0
    assert "already ingested" in capsys.readouterr().out
    assert cli(["--force"]) == 0
    assert "ingested 3 passages" in capsys.readouterr().out
    assert count(session, Passage) == 3


def test_cli_explains_an_empty_sources_table(cli, capsys):
    assert cli([]) == 1

    assert "register_sources --db" in capsys.readouterr().err


def test_cli_reports_a_missing_database_without_a_traceback(monkeypatch, capsys):
    def no_database():
        raise RuntimeError("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    monkeypatch.setattr(load_documents, "get_engine", no_database)

    assert load_documents.main([]) == 1

    assert "DATABASE_URL is not set" in capsys.readouterr().err
