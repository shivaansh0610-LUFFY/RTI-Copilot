"""Cases, stored in the `cases` table, and their information requests, in `requests`.

Every function takes the SQLAlchemy session of the current request (see app.db.get_db) as a
keyword argument, the same convention as app.services.public_info, and commits before it
returns, so what it wrote survives a restart of the server. Pass commit=False to put several
writes in one transaction: the last one commits, and if anything fails before that, closing the
session (get_db does) discards them all.
"""

import re
from collections import Counter
from typing import Any
from uuid import UUID

from sqlalchemy import String, select
from sqlalchemy.orm import Session

from app.models import Case, CaseRequest
from app.schemas import InformationRequest, PublicSource

# The stages of a case, in the order a case moves through them.
GRIEVANCE_CAPTURED = "GRIEVANCE_CAPTURED"
REQUESTS_GENERATED = "REQUESTS_GENERATED"
DRAFT_READY = "DRAFT_READY"

# requests.public_status for each value of InformationRequest.publicly_available.
# None in both places means the public-availability check has not run.
ALREADY_PUBLIC = "already_public"
NOT_FOUND = "not_found"
_STATUS_OF_AVAILABLE = {True: ALREADY_PUBLIC, False: NOT_FOUND, None: None}
_AVAILABLE_OF_STATUS = {status: available for available, status in _STATUS_OF_AVAILABLE.items()}

# PostgreSQL rejects text longer than its VARCHAR column; SQLite does not, so the limit is
# checked here, in terms of the model, rather than left to fail only on the real database.
_MAX_LENGTHS = {
    column.name: column.type.length
    for column in CaseRequest.__table__.columns
    if isinstance(column.type, String) and column.type.length is not None
}
_API_NAMES = {"rq_id": "id"}  # the one column whose name differs from the InformationRequest field


class InvalidRequests(ValueError):
    """The requests cannot be stored: an id used twice, or text longer than its column allows."""


def create_case(grievance_text: str, *, session: Session) -> Case:
    case = Case(grievance_text=grievance_text, status=GRIEVANCE_CAPTURED)
    session.add(case)
    session.commit()
    return case


def get_case(case_id: UUID, *, session: Session) -> Case | None:
    return session.get(Case, case_id)


def update_case(
    case: Case,
    *,
    session: Session,
    clarification: dict[str, str] | None = None,
    status: str | None = None,
    commit: bool = True,
) -> Case:
    """Set the clarification and/or the status; a field left as None is not changed
    (an empty clarification clears it)."""
    if clarification is not None:
        case.clarification = clarification
    if status is not None:
        case.status = status
    session.add(case)
    _finish(session, commit)
    return case


def save_requests(
    case: Case, requests: list[InformationRequest], *, session: Session, commit: bool = True
) -> None:
    """Make the case's stored requests exactly `requests`.

    Requests are matched to stored rows by id: a known id is updated in place (so its row keeps
    its primary key when, say, the public-info check fills in where it was found), a new id is
    added, and a stored id that is not in the list is deleted. Raises InvalidRequests, before
    changing anything, if an id repeats or a value is too long for its column.
    """
    rows = [_row_values(request) for request in requests]
    _check(rows)

    stored = {
        row.rq_id: row for row in session.scalars(select(CaseRequest).where(CaseRequest.case_id == case.id))
    }
    for values in rows:
        row = stored.pop(values["rq_id"], None)
        if row is None:
            session.add(CaseRequest(case_id=case.id, **values))
        else:
            for name, value in values.items():
                setattr(row, name, value)
    for row in stored.values():  # what is left is no longer requested
        session.delete(row)
    _finish(session, commit)


def load_requests(case: Case, *, session: Session) -> list[InformationRequest]:
    """The case's stored requests, ordered by id (numbers compare as numbers: RQ-2 before RQ-10).

    The table has no position column, so the order a citizen arranged them in is not kept.
    """
    rows = session.scalars(select(CaseRequest).where(CaseRequest.case_id == case.id)).all()
    return [_to_request(row) for row in sorted(rows, key=lambda row: _id_order(row.rq_id))]


def _finish(session: Session, commit: bool) -> None:
    if commit:
        session.commit()
    else:
        session.flush()


def _row_values(request: InformationRequest) -> dict[str, Any]:
    # Where a request was found is only kept when it was found.
    source = request.public_source if request.publicly_available else None
    return {
        "rq_id": request.id,
        "category": request.category,
        "title": request.title,
        "authority": request.authority,
        "period": request.period,
        "quality": request.quality,
        "source": request.source,
        "context": request.context,
        "public_status": _STATUS_OF_AVAILABLE[request.publicly_available],
        "public_source_title": source.title if source else None,
        "public_source_url": source.url if source else None,
    }


def _to_request(row: CaseRequest) -> InformationRequest:
    found_at = None
    if row.public_status == ALREADY_PUBLIC and row.public_source_title and row.public_source_url:
        found_at = PublicSource(title=row.public_source_title, url=row.public_source_url)
    return InformationRequest(
        id=row.rq_id,
        category=row.category,
        title=row.title,
        authority=row.authority,
        period=row.period,
        quality=row.quality,
        source=row.source,
        context=row.context,
        publicly_available=_AVAILABLE_OF_STATUS[row.public_status],
        public_source=found_at,
    )


def _check(rows: list[dict[str, Any]]) -> None:
    repeated = sorted(rq_id for rq_id, count in Counter(values["rq_id"] for values in rows).items() if count > 1)
    if repeated:
        raise InvalidRequests(f"Request ids must be unique, but {', '.join(repeated)} appear more than once.")
    for values in rows:
        for name, limit in _MAX_LENGTHS.items():
            value = values[name]
            if value is not None and len(value) > limit:
                raise InvalidRequests(
                    f"Request {values['rq_id']}: {_API_NAMES.get(name, name)} is {len(value)} characters "
                    f"long, but at most {limit} are allowed."
                )


def _id_order(rq_id: str) -> list[str | int]:
    # re.split with a group alternates text and digits, so the digits are the odd items.
    return [int(part) if index % 2 else part for index, part in enumerate(re.split(r"(\d+)", rq_id))]
