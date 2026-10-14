from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import case_store
from app.db import get_db
from app.models import Case
from app.schemas import CaseCreate, CaseCreated

router = APIRouter(prefix="/cases", tags=["cases"])

# FastAPI hands every dependency of a request the same session, so a route and CaseDep share one.
SessionDep = Annotated[Session, Depends(get_db)]


def require_case(case_id: UUID, session: SessionDep) -> Case:
    """Dependency for every case-scoped route: 404 if the case doesn't exist."""
    case = case_store.get_case(case_id, session=session)
    if case is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    return case


CaseDep = Annotated[Case, Depends(require_case)]


@router.post("", response_model=CaseCreated, status_code=status.HTTP_201_CREATED)
def create_case(body: CaseCreate, session: SessionDep) -> CaseCreated:
    case = case_store.create_case(body.grievance_text, session=session)
    return CaseCreated(case_id=case.id)
