from fastapi import APIRouter

from app.config import get_settings
from app.routers.cases import CaseDep
from app.schemas import DecomposeBody, DraftResponse, InformationRequest, RequestsBody
from app.services.drafting import mock, real
from app.services.drafting.specificity import is_vague

# The RTI Online portal's limit on the application text field itself; longer text can still be
# filed as a PDF attachment instead, so this is a warning, not a hard failure.
PORTAL_CHAR_LIMIT = 3000

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


@router.post("/draft", response_model=DraftResponse, response_model_exclude_none=True)
def draft(case: CaseDep, body: RequestsBody) -> DraftResponse:
    case.status = "DRAFT_READY"
    draft_text = mock.generate_draft(body.requests)
    char_count = len(draft_text)
    over_limit = char_count > PORTAL_CHAR_LIMIT
    warning = (
        f"This draft is {char_count:,} characters, over the RTI portal's {PORTAL_CHAR_LIMIT:,}-"
        "character limit for the application text field. Upload it as a PDF attachment instead "
        "of pasting it in."
        if over_limit
        else None
    )
    flagged_request_ids = [request.id for request in body.requests if is_vague(request.title)]
    return DraftResponse(
        draft_text=draft_text,
        char_count=char_count,
        over_limit=over_limit,
        warning=warning,
        flagged_request_ids=flagged_request_ids,
    )
