from fastapi import APIRouter

from app.config import get_settings
from app.routers.cases import CaseDep
from app.schemas import DecomposeBody, DraftResponse, InformationRequest, RequestsBody
from app.services.drafting import mock, real

router = APIRouter(prefix="/cases/{case_id}", tags=["drafting"])


@router.post(
    "/decompose",
    response_model=list[InformationRequest],
    response_model_exclude_none=True,
)
def decompose(case: CaseDep, body: DecomposeBody) -> list[InformationRequest]:
    case.clarification = body.clarification
    case.status = "REQUESTS_GENERATED"
    decompose_grievance = real.decompose_grievance if get_settings().use_llm_drafting else mock.decompose_grievance
    return decompose_grievance(case.grievance_text, body.clarification)


@router.post(
    "/public-info-check",
    response_model=list[InformationRequest],
    response_model_exclude_none=True,
)
def public_info_check(case: CaseDep, body: RequestsBody) -> list[InformationRequest]:
    return mock.check_public_info(body.requests)


@router.post("/draft", response_model=DraftResponse)
def draft(case: CaseDep, body: RequestsBody) -> DraftResponse:
    case.status = "DRAFT_READY"
    return DraftResponse(draft_text=mock.generate_draft(body.requests))
