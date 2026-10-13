"""Checks whether a request's record already appears in the registered corpus
(the RTI Act, Rules, CPWD manuals, PWD Delhi's own Section 4(1)(b) disclosure
page) instead of requiring the citizen to file for it.

Deliberately conservative: a false "already public" sends a citizen away with
nothing. Vector similarity alone proves a passage is about the same topic, not
that it contains the record, so only an exact keyword match (the same
full-text search used by app.services.retrieval, not the vector side of it)
marks a request public — and only when that passage can be traced back to a
registered source, so the citizen gets a real citation to check for
themselves. Anything else, including no match at all, is left for the citizen
to file.
"""

from sqlalchemy.orm import Session

from app.db import get_engine
from app.models import Document, Passage, Source
from app.schemas import InformationRequest, PublicSource
from app.services.retrieval import build_tsquery, keyword_statement


def check_public_info(
    requests: list[InformationRequest], *, session: Session | None = None
) -> list[InformationRequest]:
    """Marks each request publicly_available (with its public_source) or not.

    Opens its own database session unless one is passed in.
    """
    if session is not None:
        return [_check_one(session, request) for request in requests]
    with Session(get_engine(), expire_on_commit=False) as own_session:
        return [_check_one(own_session, request) for request in requests]


def _check_one(session: Session, request: InformationRequest) -> InformationRequest:
    source = _matching_source(session, request.title)
    if source is None:
        return request.model_copy(update={"publicly_available": False, "public_source": None})
    return request.model_copy(
        update={
            "publicly_available": True,
            "public_source": PublicSource(title=source.title, url=source.url),
        }
    )


def _matching_source(session: Session, title: str) -> Source | None:
    tsquery = build_tsquery(title)
    if not tsquery:
        return None
    passage_id = session.scalars(keyword_statement(tsquery, limit=1)).first()
    if passage_id is None:
        return None
    passage = session.get(Passage, passage_id)
    if passage is None:
        return None
    document = session.get(Document, passage.document_id)
    if document is None or document.source_id is None:
        return None
    return session.get(Source, document.source_id)
