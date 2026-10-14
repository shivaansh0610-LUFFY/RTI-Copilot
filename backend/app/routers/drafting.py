from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session

from app import case_store
from app.config import get_settings
from app.models import Case
from app.routers.cases import CaseDep, SessionDep
from app.schemas import DecomposeBody, DraftResponse, InformationRequest, RequestsBody
from app.services.drafting import mock, real
from app.services.drafting.specificity import is_vague

# The RTI Online portal's limit on the application text field itself; longer text can still be
# filed as a PDF attachment instead, so this is a warning, not a hard failure.
PORTAL_CHAR_LIMIT = 3000

router = APIRouter(prefix="/cases/{case_id}", tags=["drafting"])


def _save_requests(case: Case, requests: list[InformationRequest], session: Session) -> None:
    """Store the case's requests, committing everything the route has changed so far. Requests
    the table cannot hold (an id used twice, an over-long value) are a 422, not a server error."""
    try:
        case_store.save_requests(case, requests, session=session)
    except case_store.InvalidRequests as error:
        raise HTTPException(422, str(error)) from error


@router.post(
    "/decompose",
    response_model=list[InformationRequest],
    response_model_exclude_none=True,
)
def decompose(case: CaseDep, session: SessionDep, body: DecomposeBody) -> list[InformationRequest]:
    decompose_grievance = real.decompose_grievance if get_settings().use_llm_drafting else mock.decompose_grievance
    requests = decompose_grievance(case.grievance_text, body.clarification)
    # One transaction: the case only moves on if its requests were stored too.
    case_store.update_case(
        case,
        session=session,
        clarification=body.clarification,
        status=case_store.REQUESTS_GENERATED,
        commit=False,
    )
    _save_requests(case, requests, session)
    return requests


@router.post(
    "/public-info-check",
    response_model=list[InformationRequest],
    response_model_exclude_none=True,
)
def public_info_check(case: CaseDep, session: SessionDep, body: RequestsBody) -> list[InformationRequest]:
    check_public_info = real.check_public_info if get_settings().use_public_info_lookup else mock.check_public_info
    checked = check_public_info(body.requests)
    _save_requests(case, checked, session)
    return checked


@router.post("/draft", response_model=DraftResponse, response_model_exclude_none=True)
def draft(case: CaseDep, session: SessionDep, body: RequestsBody) -> DraftResponse:
    draft_text = mock.generate_draft(body.requests)
    # The draft is built from these requests (the citizen may have edited them since the check),
    # so these are the ones to keep, in the same transaction as the case becoming DRAFT_READY.
    case_store.update_case(case, session=session, status=case_store.DRAFT_READY, commit=False)
    _save_requests(case, body.requests, session)
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
