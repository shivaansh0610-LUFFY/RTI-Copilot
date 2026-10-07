from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app import case_store
from app.case_store import Case
from app.schemas import CaseCreate, CaseCreated

router = APIRouter(prefix="/cases", tags=["cases"])


def require_case(case_id: UUID) -> Case:
    """Dependency for every case-scoped route: 404 if the case doesn't exist."""
    case = case_store.get_case(case_id)
    if case is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    return case


CaseDep = Annotated[Case, Depends(require_case)]


@router.post("", response_model=CaseCreated, status_code=status.HTTP_201_CREATED)
def create_case(body: CaseCreate) -> CaseCreated:
    case = case_store.create_case(body.grievance_text)
    return CaseCreated(case_id=case.id)
