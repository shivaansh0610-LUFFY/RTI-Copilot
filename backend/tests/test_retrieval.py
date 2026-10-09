from uuid import uuid4

import pytest
from corpus_support import (
    add_source,
    clause,
    database_session,
    fake_embed,
    forbid_real_model,
    make_pdf,
    use_fake_embeddings,
)
from sqlalchemy.dialects import postgresql

from app.models import Document, Passage
from app.services import embeddings, retrieval
from app.services.retrieval import (
    build_tsquery,
    keyword_statement,
    reciprocal_rank_fusion,
    search_passages,
    vector_statement,
)
from ingest.load_documents import load_all


@pytest.fixture(autouse=True)
def fake_embeddings(monkeypatch):
    forbid_real_model(monkeypatch)
    use_fake_embeddings(monkeypatch)


# --- build_tsquery ----------------------------------------------------------------------------


def test_words_are_joined_with_and():
    assert build_tsquery("fee for an application") == "fee & for & an & application"


def test_punctuation_and_tsquery_operators_cannot_reach_postgres():
    assert build_tsquery("what's the fee? (Rs. 10) & more | !x:* <-> 'y'") == "what & s & the & fee & rs & 10 & more & x & y"


def test_repeated_words_and_underscores_are_dropped():
    assert build_tsquery("road road ROAD under_pass") == "road & under & pass"


def test_section_references_survive():
    assert build_tsquery("Section 6(1)") == "section & 6 & 1"


@pytest.mark.parametrize("query", ["", "   ", "???", "& | !"])
def test_a_query_with_no_words_gives_an_empty_tsquery(query):
    assert build_tsquery(query) == ""


# --- reciprocal_rank_fusion -------------------------------------------------------------------


def test_a_passage_found_by_both_searches_beats_one_found_by_either():
    vector, keyword = ["a", "b", "c"], ["c", "d", "b"]

    # c: 1/63 + 1/61, b: 1/62 + 1/63, a: 1/61 (top of one list), d: 1/62 (second in the other)
    assert reciprocal_rank_fusion([vector, keyword]) == ["c", "b", "a", "d"]


def test_first_in_both_lists_wins():
    assert reciprocal_rank_fusion([["x", "y"], ["x", "z"]])[0] == "x"


def test_one_list_keeps_its_order():
    assert reciprocal_rank_fusion([["c", "a", "b"]]) == ["c", "a", "b"]


def test_ties_keep_the_order_of_first_appearance():
    assert reciprocal_rank_fusion([["a"], ["b"]]) == ["a", "b"]
    assert reciprocal_rank_fusion([["b"], ["a"]]) == ["b", "a"]


def test_nothing_in_nothing_out():
    assert reciprocal_rank_fusion([]) == []
    assert reciprocal_rank_fusion([[], []]) == []


# --- the SQL ----------------------------------------------------------------------------------


def compiled(statement) -> str:
    return str(statement.compile(dialect=postgresql.dialect()))


def test_vector_search_orders_by_cosine_distance_and_skips_unembedded_passages():
    sql = compiled(vector_statement([0.1] * 1024, 50))

    assert "passages.embedding <=> " in sql
    assert "passages.embedding IS NOT NULL" in sql
    assert "LIMIT" in sql


def test_keyword_search_matches_and_ranks_with_the_english_configuration():
    sql = compiled(keyword_statement("road & repair", 50))

    assert "passages.tsv @@ to_tsquery('english'::regconfig," in sql
    assert "ts_rank(passages.tsv, to_tsquery('english'::regconfig," in sql
    assert "DESC" in sql and "LIMIT" in sql


# --- search_passages, with the two searches stubbed -------------------------------------------
# The real searches need PostgreSQL (below). This checks the glue around them on SQLite: merging,
# the cut-off at k, loading the passages in order, and the early exits.


@pytest.fixture
def session():
    with database_session("sqlite") as db_session:
        yield db_session


@pytest.fixture
def stored(session, tmp_path):
    """Five passages (ids returned in creation order) in one document."""
    source = add_source(session, tmp_path, "act.pdf", make_pdf([["x"]]))
    document = Document(source_id=source.id, kind="corpus", filename="act.pdf", page_count=1)
    session.add(document)
    session.flush()
    passages = [
        Passage(document_id=document.id, page=1, paragraph=number, text=f"passage {number}", embedding=fake_embed("x"))
        for number in range(1, 6)
    ]
    session.add_all(passages)
    session.commit()
    return [passage.id for passage in passages]


def stub_searches(monkeypatch, vector, keyword):
    calls = {"vector": 0, "keyword": 0}

    def vector_ranking(session, embedding, limit):
        calls["vector"] += 1
        return vector

    def keyword_ranking(session, tsquery, limit):
        calls["keyword"] += 1
        return keyword

    monkeypatch.setattr(retrieval, "_vector_ranking", vector_ranking)
    monkeypatch.setattr(retrieval, "_keyword_ranking", keyword_ranking)
    return calls


def test_results_are_passages_in_merged_order(session, stored, monkeypatch):
    p1, p2, p3, p4, p5 = stored
    stub_searches(monkeypatch, vector=[p3, p1, p2], keyword=[p1, p5])

    results = search_passages("anything", k=4, session=session)

    assert all(isinstance(result, Passage) for result in results)
    assert [result.id for result in results] == [p1, p3, p5, p2]
    assert [result.text for result in results] == ["passage 1", "passage 3", "passage 5", "passage 2"]


def test_only_k_results_are_returned(session, stored, monkeypatch):
    stub_searches(monkeypatch, vector=stored, keyword=[])

    assert len(search_passages("anything", k=2, session=session)) == 2
    assert len(search_passages("anything", session=session)) == 5  # default k is 5
    assert len(search_passages("anything", k=50, session=session)) == 5  # fewer exist than asked for


def test_the_query_is_embedded_as_a_query(session, stored, monkeypatch):
    seen = []
    monkeypatch.setattr(embeddings, "embed_query", lambda query: seen.append(query) or fake_embed(query))
    stub_searches(monkeypatch, vector=[], keyword=[])

    search_passages("who is the PIO", session=session)

    assert seen == ["who is the PIO"]


def test_a_keyword_hit_beats_a_vector_hit_on_a_tie(session, stored, monkeypatch):
    p1, p2, *_ = stored
    stub_searches(monkeypatch, vector=[p1], keyword=[p2])  # both first in their list

    assert [result.id for result in search_passages("anything", k=2, session=session)] == [p2, p1]


def test_nothing_found_means_an_empty_list(session, stored, monkeypatch):
    stub_searches(monkeypatch, vector=[], keyword=[])

    assert search_passages("anything", session=session) == []


@pytest.mark.parametrize(("query", "k"), [("", 5), ("   ", 5), ("road", 0), ("road", -1)])
def test_blank_query_or_no_room_returns_nothing_without_searching(session, stored, monkeypatch, query, k):
    calls = stub_searches(monkeypatch, vector=stored, keyword=stored)
    monkeypatch.setattr(embeddings, "embed_query", lambda q: pytest.fail("embedded a blank query"))

    assert search_passages(query, k, session=session) == []
    assert calls == {"vector": 0, "keyword": 0}


def test_a_query_without_words_uses_only_the_vector_search(session, stored, monkeypatch):
    calls = stub_searches(monkeypatch, vector=stored[:2], keyword=stored)

    results = search_passages("???", session=session)

    assert [result.id for result in results] == stored[:2]
    assert calls == {"vector": 1, "keyword": 0}


def test_each_search_is_asked_for_at_least_k_candidates(session, stored, monkeypatch):
    limits = []
    monkeypatch.setattr(retrieval, "_vector_ranking", lambda s, e, limit: limits.append(limit) or [])
    monkeypatch.setattr(retrieval, "_keyword_ranking", lambda s, t, limit: limits.append(limit) or [])

    search_passages("road", k=3, session=session)
    search_passages("road", k=200, session=session)

    assert limits == [retrieval.CANDIDATES] * 2 + [200] * 2


def test_without_a_session_it_opens_its_own_and_the_results_outlive_it(session, stored, monkeypatch):
    stub_searches(monkeypatch, vector=stored[:2], keyword=[])
    monkeypatch.setattr(retrieval, "get_engine", lambda: session.get_bind())

    results = search_passages("road")

    assert [result.text for result in results] == ["passage 1", "passage 2"]  # loaded, though that session is closed


# --- search_passages on PostgreSQL ------------------------------------------------------------
# Real ts_rank, `@@` and `<=>`. Runs when TEST_DATABASE_URL is set; the embeddings are the fake
# word-hash ones, so "similar" means "shares words", which keeps the expectations checkable.

CORPUS = {
    "request": "A person who desires to obtain information under this Act shall make a request in writing to the Public Information Officer along with the prescribed fee.",
    "appeal": "Any person who does not receive a decision within the specified time may prefer an appeal to the first appellate authority within thirty days.",
    "inspection": "The Executive Engineer shall inspect road works before payment and record the measurements in the Measurement Book.",
    "potholes": "Potholes on roads maintained by the Public Works Department must be repaired and the repair recorded in the maintenance register.",
    "penalty": "A penalty of two hundred and fifty rupees per day shall be imposed on the Public Information Officer for delay, up to twenty five thousand rupees.",
}


@pytest.fixture
def pg(tmp_path):
    with database_session("postgres") as db_session:
        source = add_source(db_session, tmp_path, "act.pdf", make_pdf([["x"]]))
        document = Document(source_id=source.id, kind="corpus", filename="act.pdf", page_count=1)
        db_session.add(document)
        db_session.flush()
        for number, (key, text) in enumerate(CORPUS.items(), start=1):
            db_session.add(
                Passage(document_id=document.id, page=1, paragraph=number, text=text, embedding=fake_embed(text))
            )
        # Reachable only by keyword: it has no embedding.
        db_session.add(
            Passage(
                document_id=document.id,
                page=2,
                paragraph=1,
                text="Entries in the register must be countersigned by the Assistant Engineer.",
            )
        )
        db_session.commit()
        yield db_session


def test_the_relevant_passage_comes_first(pg):
    assert search_passages("appeal to the first appellate authority", session=pg)[0].text == CORPUS["appeal"]
    assert search_passages("who repairs potholes on roads", session=pg)[0].text == CORPUS["potholes"]
    assert search_passages("measurement book payment", session=pg)[0].text == CORPUS["inspection"]


def test_a_shared_term_brings_back_every_passage_that_has_it(pg):
    top_two = search_passages("Public Information Officer", k=2, session=pg)

    assert {passage.text for passage in top_two} == {CORPUS["request"], CORPUS["penalty"]}


def test_k_limits_the_results_and_the_best_stay_first(pg):
    results = search_passages("appeal to the first appellate authority", k=3, session=pg)

    assert len(results) == 3
    assert results[0].text == CORPUS["appeal"]
    assert search_passages("appeal", k=1, session=pg)[0].text == CORPUS["appeal"]


def test_keyword_search_stems_words(pg):
    # "repairing" shares no word with the passage, so only full-text search (stem "repair") can find it.
    assert search_passages("repairing", k=1, session=pg)[0].text == CORPUS["potholes"]


def test_a_passage_without_an_embedding_is_still_found_by_keyword(pg):
    results = search_passages("countersigned", k=1, session=pg)

    assert results[0].text.startswith("Entries in the register")
    assert results[0].embedding is None


def test_awkward_punctuation_is_not_a_syntax_error(pg):
    results = search_passages("what's the fee? (Rs. 10) & more | !x:* <-> 'y' \\ ;--", session=pg)

    assert isinstance(results, list)


def test_a_query_nothing_matches_still_returns_the_nearest_passages(pg):
    results = search_passages("zzzqqq", k=2, session=pg)

    assert len(results) == 2  # the vector search always has an answer


def test_blank_query_is_empty_on_a_real_database_too(pg):
    assert search_passages("", session=pg) == []


def test_results_do_not_shuffle_between_identical_searches(pg):
    runs = [[p.id for p in search_passages("Public", k=5, session=pg)] for _ in range(3)]

    assert runs[0] == runs[1] == runs[2]


def test_without_a_session_it_uses_the_application_engine(pg, monkeypatch):
    monkeypatch.setattr(retrieval, "get_engine", lambda: pg.get_bind())

    results = search_passages("appeal to the first appellate authority", k=1)

    assert results[0].text == CORPUS["appeal"]  # readable although the session that loaded it is closed


def test_an_ingested_pdf_is_searchable(pg, tmp_path):
    pdf = make_pdf([[clause("a", 300) + " pothole compensation", "(b) The contractor shall file the audit certificate."]])
    add_source(pg, tmp_path, "manual.pdf", pdf, title="Zz manual", url=f"https://example.gov.in/{uuid4().hex}.pdf")

    results = load_all(pg, tmp_path)  # the fixture's own source is already ingested; this one is new
    top = search_passages("audit certificate contractor", k=1, session=pg)[0]

    assert all(result.ok for result in results)
    assert "audit certificate" in top.text
