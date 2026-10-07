"""Temporary in-memory case store.

Replace with the `cases` table once the models and first migration are merged:
swap the bodies of these functions for queries on a session from app.db.get_db.
Cases are lost when the server restarts.
"""

from dataclasses import dataclass, field
from uuid import UUID, uuid4


@dataclass
class Case:
    id: UUID
    grievance_text: str
    clarification: dict[str, str] = field(default_factory=dict)
    status: str = "GRIEVANCE_CAPTURED"


_cases: dict[UUID, Case] = {}


def create_case(grievance_text: str) -> Case:
    case = Case(id=uuid4(), grievance_text=grievance_text)
    _cases[case.id] = case
    return case


def get_case(case_id: UUID) -> Case | None:
    return _cases.get(case_id)
