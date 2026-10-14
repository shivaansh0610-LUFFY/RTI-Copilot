"""Cases, stored in the `cases` table.

Every function takes the SQLAlchemy session of the current request (see app.db.get_db) as a
keyword argument, the same convention as app.services.public_info, and commits before it
returns, so what it wrote survives a restart of the server. Pass commit=False to put several
writes in one transaction: the last one commits, and if anything fails before that, closing the
session (get_db does) discards them all.
"""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Case

# The stages of a case, in the order a case moves through them.
GRIEVANCE_CAPTURED = "GRIEVANCE_CAPTURED"
REQUESTS_GENERATED = "REQUESTS_GENERATED"
DRAFT_READY = "DRAFT_READY"


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


def _finish(session: Session, commit: bool) -> None:
    if commit:
        session.commit()
    else:
        session.flush()
