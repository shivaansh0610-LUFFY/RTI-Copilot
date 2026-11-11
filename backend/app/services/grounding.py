"""Passages of the official corpus that an RTI request can rest on.

The point of citing the CPWD Works Manual or the RTI Act next to a request is to show the
citizen (and the PIO) that the record asked for is one the department is required to keep:
a request for "the Measurement Book entries for this work" is hard to answer with "no such
record" when the manual says measurements are recorded in one.

relevant_passages() searches the corpus with the grievance itself and with a few fixed
questions about record-keeping, merges the hits by reciprocal rank fusion (the same method as
app.services.retrieval) and returns the best few with the source each came from.
"""

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_engine
from app.models import Document, Passage, Source
from app.services import retrieval

# The grievance says what went wrong; these ask what records exist about road works.
RECORD_QUERIES = [
    "records to be maintained for repair and maintenance of roads",
    "measurements of work done are recorded in the measurement book",
    "inspection and quality control of works by the department",
    "defect liability period: the contractor shall rectify defects at his own cost",
    "work order, agreement and completion certificate of a work",
]
PER_QUERY = 4
MAX_PASSAGES = 8
QUOTE_CHARS = 280


@dataclass(frozen=True)
class CorpusPassage:
    id: str  # "S-1", "S-2", ... as shown to the model
    text: str
    page: int  # the page of the PDF file (not the number printed on it)
    source_title: str
    url: str


def relevant_passages(grievance: str, *, session: Session | None = None) -> list[CorpusPassage]:
    """At most MAX_PASSAGES passages, best first. Opens its own session unless one is given."""
    if session is not None:
        return _relevant(session, grievance)
    with Session(get_engine(), expire_on_commit=False) as own_session:
        return _relevant(own_session, grievance)


def _relevant(session: Session, grievance: str) -> list[CorpusPassage]:
    queries = [grievance[:1000], *RECORD_QUERIES]
    rankings = [
        [passage.id for passage in retrieval.search_passages(query, PER_QUERY, session=session)]
        for query in queries
    ]
    best = retrieval.reciprocal_rank_fusion(rankings)[:MAX_PASSAGES]
    rows = session.execute(
        select(Passage.id, Passage.text, Passage.page, Source.title, Source.url)
        .join(Document, Passage.document_id == Document.id)
        .join(Source, Document.source_id == Source.id)
        .where(Passage.id.in_(best))
    ).all()
    by_id = {row.id: row for row in rows}
    found = [by_id[passage_id] for passage_id in best if passage_id in by_id]
    return [
        CorpusPassage(id=f"S-{number}", text=clean(row.text), page=row.page, source_title=row.title, url=row.url)
        for number, row in enumerate(found, start=1)
    ]


# Running headers and footers that pypdf leaves inside the CPWD passages.
PAGE_CHROME = re.compile(
    r"\b\d{2,3} Years of (?:Engineering Excellence|CPWD'?s dedicated service to the Nation)\b"
    r"|\bSECTION \d+ CPWD WORKS MANUAL \d{4}\b"
    r"|\bCPWD WORKS MANUAL \d{4}\b"
    r"|\bANNEXURE TO SOPs\s?"
)
# Plain numbers only: a clause number such as "1." or "20.1.12A." has a dot, so it stays.
LEADING_PAGE_NUMBERS = re.compile(r"^(?:\d{1,4}\s+)+")


def clean(text: str) -> str:
    """The passage without page headers, footers and stray page numbers at its start."""
    text = " ".join(PAGE_CHROME.sub(" ", text).split())
    return LEADING_PAGE_NUMBERS.sub("", text)


def quote(text: str) -> str:
    """The start of a passage, cleaned and cut at a word boundary, for showing next to a request."""
    text = clean(text)
    if len(text) <= QUOTE_CHARS:
        return text
    cut = text.rfind(" ", 0, QUOTE_CHARS)
    return text[: cut if cut > 0 else QUOTE_CHARS].rstrip(" ,;:") + " …"
