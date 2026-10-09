"""Hybrid search over the corpus passages.

search_passages() runs two searches and merges their rankings:
  * vector: pgvector cosine distance between the query's embedding and each passage's embedding
    (finds passages that mean the same thing in different words);
  * keyword: PostgreSQL full-text search, ranked by ts_rank, for passages containing every word of
    the query (finds the exact terms an embedding blurs: "DG/Manual-2026/01", "Measurement Book").

The two are merged with reciprocal rank fusion: a passage scores 1 / (60 + rank) in each list it
appears in, and the scores are added. This was chosen over averaging normalised scores because
ts_rank has no fixed range (and depends on the query's length), while cosine similarity does, so
rescaling them onto a shared 0-1 scale is guesswork that shifts with every query. Ranks need no
rescaling, so there is nothing to tune; a passage that both searches like beats one only a single
search likes, and one search finding nothing (no keyword match) simply drops out of the sum.

There is no vector index (see the initial migration): a sequential scan over a few thousand
passages is fast, and an approximate index would only make the results less exact.
"""

import re
from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Select, func, literal_column, select
from sqlalchemy.orm import Session

from app.db import get_engine
from app.models import Passage
from app.services import embeddings

CANDIDATES = 50  # hits taken from each search before merging
RRF_CONSTANT = 60  # the value from the original paper; it damps the lead of the very top ranks

WORD = re.compile(r"[^\W_]+")
ENGLISH = literal_column("'english'::regconfig")  # the configuration the `tsv` column is built with


def search_passages(query: str, k: int = 5, *, session: Session | None = None) -> list[Passage]:
    """The `k` passages that best match `query`, best first.

    Opens its own database session unless one is passed in. The returned passages are fully
    loaded, so they stay usable after that session closes.
    """
    if k < 1 or not query.strip():
        return []
    if session is not None:
        return _search(session, query, k)
    with Session(get_engine(), expire_on_commit=False) as own_session:
        return _search(own_session, query, k)


def _search(session: Session, query: str, k: int) -> list[Passage]:
    limit = max(CANDIDATES, k)
    rankings = []
    # Keyword hits go first so that they win ties. A keyword search only returns passages that
    # contain the words, while the vector search always returns its nearest neighbours however
    # poor, so on a query only the keyword search understands (an acronym, a section number) the
    # vector search's arbitrary first hit must not tie with the real match.
    tsquery = build_tsquery(query)
    if tsquery:
        rankings.append(_keyword_ranking(session, tsquery, limit))
    rankings.append(_vector_ranking(session, embeddings.embed_query(query), limit))

    best = reciprocal_rank_fusion(rankings)[:k]
    passages = {passage.id: passage for passage in session.scalars(select(Passage).where(Passage.id.in_(best)))}
    return [passages[passage_id] for passage_id in best]


def _vector_ranking(session: Session, embedding: list[float], limit: int) -> list[UUID]:
    return list(session.scalars(vector_statement(embedding, limit)))


def _keyword_ranking(session: Session, tsquery: str, limit: int) -> list[UUID]:
    return list(session.scalars(keyword_statement(tsquery, limit)))


def vector_statement(embedding: list[float], limit: int) -> Select[tuple[UUID]]:
    """Passage ids nearest to `embedding` by cosine distance (`<=>`), nearest first."""
    return (
        select(Passage.id)
        .where(Passage.embedding.is_not(None))
        .order_by(Passage.embedding.cosine_distance(embedding), *_reading_order())
        .limit(limit)
    )


def keyword_statement(tsquery: str, limit: int) -> Select[tuple[UUID]]:
    """Passage ids matching the full-text query (`@@`), highest ts_rank first."""
    query = func.to_tsquery(ENGLISH, tsquery)
    return (
        select(Passage.id)
        .where(Passage.tsv.op("@@")(query))
        .order_by(func.ts_rank(Passage.tsv, query).desc(), *_reading_order())
        .limit(limit)
    )


def _reading_order():
    # Tie-break for equal scores (common with ts_rank), so results do not shuffle between runs.
    return (Passage.document_id, Passage.page, Passage.paragraph)


def build_tsquery(query: str) -> str:
    """The query's words joined with AND, in to_tsquery syntax ("" if it has no words).

    Raw text cannot go to to_tsquery (punctuation and words without operators are syntax errors),
    so the words are extracted and joined here. AND keeps the keyword search precise: it fires
    for short, exact queries ("DG/Manual-2026/01", "Register of Dismantled Materials") and stays
    silent for a long natural-language question, which no single passage contains word for word,
    leaving the vector search to answer it. Matching ANY word instead looked more forgiving but
    was worse on real questions: ts_rank does not weigh rare words above common ones, so words
    like "time" or "information" flood the keyword ranking with noise that outvotes good vector hits.
    """
    return " & ".join(dict.fromkeys(WORD.findall(query.lower())))


def reciprocal_rank_fusion(rankings: Sequence[Sequence[UUID]], constant: int = RRF_CONSTANT) -> list[UUID]:
    """Merge best-first rankings into one. Ties keep the order of first appearance."""
    scores: dict[UUID, float] = {}
    for ranking in rankings:
        for position, item in enumerate(ranking, start=1):
            scores[item] = scores.get(item, 0.0) + 1.0 / (constant + position)
    return sorted(scores, key=lambda item: -scores[item])
