from fastapi import APIRouter, File, HTTPException, UploadFile

from app import case_store
from app.config import get_settings
from app.routers.cases import CaseDep, SessionDep
from app.schemas.responses import AppealBody, AppealResponse, ResponseAnalysis
from app.services import appeal, response_analysis

router = APIRouter(prefix="/cases/{case_id}", tags=["responses"])

AI_OFF = "AI analysis is switched off on this server (USE_LLM_DRAFTING), so read the reply yourself."


@router.post("/response", response_model=ResponseAnalysis, response_model_exclude_none=True)
def analyse_response(case: CaseDep, session: SessionDep, file: UploadFile = File(...)) -> ResponseAnalysis:
    """Upload the PIO's reply (a PDF with selectable text, or .txt) and get, for each of the
    case's stored requests, how the reply dealt with it. The file itself is not stored."""
    requests = case_store.load_requests(case, session=session)
    if not requests:
        raise HTTPException(409, "This case has no information requests yet. Draft the application first.")

    data = file.file.read(response_analysis.MAX_BYTES + 1)
    try:
        pages, passages, ocr_used = response_analysis.read_reply(file.filename or "", data)
    except response_analysis.UnreadableReply as error:
        raise HTTPException(422, str(error)) from error

    if get_settings().use_llm_drafting:
        results = response_analysis.classify_reply(requests, passages)
    else:
        results = [response_analysis.abstain(request.id, AI_OFF) for request in requests]

    case_store.update_case(case, session=session, status=case_store.RESPONSE_ANALYSED)
    return ResponseAnalysis(pages=pages, ocr_used=ocr_used, passages=passages, results=results)


@router.post("/appeal", response_model=AppealResponse)
def draft_appeal(case: CaseDep, body: AppealBody) -> AppealResponse:
    return AppealResponse(appeal_text=appeal.generate_appeal(case.grievance_text, body.items, body.language))
