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

A request about the status of an existing complaint (see
app.services.request_classifier) is a different question the static corpus
was never meant to answer, so it is checked instead against the live sources
in data/live_sources.csv, fetched fresh through app.services.live_fetch. See
data/live_sources.md for which pages were checked and why only the PGC cause
list was registered — it covers only grievances that reached the Commission,
so "not found" there is not proof a complaint doesn't exist, only that this
one live source doesn't show it.

A records request (a work order, a tender) is checked first against the live
PWD Delhi road-maintenance project feed (app.services.pwd_road_projects) —
the kind of current, project-specific record the static corpus never held in
the first place — before falling back to the static corpus, which mostly
answers law-and-procedure questions instead.
"""

import logging
import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.db import get_engine
from app.models import Document, Passage, Source
from app.schemas import InformationRequest, PublicSource
from app.services import live_fetch, live_sources, pwd_road_projects
from app.services.request_classifier import is_status_request
from app.services.retrieval import build_tsquery, keyword_statement

logger = logging.getLogger(__name__)

# A status table's own row, not just any mention of the department elsewhere on the page
# (e.g. a menu or a footer) — live_sources.md: match on a table-row line, never anywhere else.
PWD_ROW_MARKER = "public works"

_STOPWORDS = {"the", "a", "an", "of", "for", "to", "in", "on", "at", "and", "is", "was", "are", "any"}


@dataclass(frozen=True)
class _PublicSourceRef:
    title: str
    url: str


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
    if is_status_request(request.title):
        source = _live_status_source()
    else:
        source = _live_road_project_source(request.title) or _matching_source(session, request.title)
    if source is None:
        return request.model_copy(update={"publicly_available": False, "public_source": None})
    return request.model_copy(
        update={
            "publicly_available": True,
            "public_source": PublicSource(title=source.title, url=source.url),
        }
    )


def _live_status_source() -> live_sources.LiveSource | None:
    """The first registered live source whose fetched text has a PWD row in it, if any.
    A fetch failure (timeout, site down, page changed) is skipped, not raised: one source
    being unreachable should not stop the citizen's request or crash the check."""
    for source in live_sources.load_live_sources():
        try:
            text = live_fetch.fetch_live_text(source.url)
        except live_fetch.LiveFetchError:
            logger.warning("Live source unreachable, skipping: %s", source.url, exc_info=True)
            continue
        if _has_pwd_row(text):
            return source
    return None


def _has_pwd_row(text: str) -> bool:
    return any(" | " in line and PWD_ROW_MARKER in line.lower() for line in text.splitlines())


def _live_road_project_source(title: str) -> _PublicSourceRef | None:
    """A live PWD Delhi road-maintenance project whose name mentions every significant word
    of the request title (e.g. a road name), straight from the department's own Work Report
    feed (app.services.pwd_road_projects) -- not pre-ingested, asked fresh every time. A
    fetch failure is skipped, not raised, same as the status check above."""
    words = _title_words(title)
    if not words:
        return None
    try:
        projects = pwd_road_projects.fetch_road_projects()
    except pwd_road_projects.RoadProjectsFetchError:
        logger.warning("PWD road-projects feed unreachable, skipping", exc_info=True)
        return None
    for project in projects:
        if words <= _title_words(project.searchable_text):
            # project.url (the API record) looks more specific but the site refuses direct
            # browser navigation to it ("Direct browser access to API endpoints is not
            # allowed") -- confirmed by hand, not assumed. A citizen clicking it would hit a
            # dead end, so the link goes to the real, browsable search page instead; the
            # matched project's own name is quoted in the title so the citation is still
            # specific even though the URL is the general page.
            label = project.name if len(project.name) <= 90 else project.name[:87] + "..."
            return _PublicSourceRef(
                title=f"PWD Delhi Work Report (live): {label}", url=pwd_road_projects.SOURCE_PAGE_URL
            )
    return None


def _title_words(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", text.lower()) if word not in _STOPWORDS and len(word) > 2}


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
