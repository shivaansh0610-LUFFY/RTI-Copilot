from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app import case_store
from app.config import get_settings
from app.routers.cases import CaseDep, SessionDep
from app.schemas.responses import AppealBody, AppealResponse, ResponseAnalysis
from app.services import appeal, response_analysis

router = APIRouter(prefix="/cases/{case_id}", tags=["responses"])

AI_OFF = "AI analysis is switched off on this server (USE_LLM_DRAFTING), so read the reply yourself."


@router.post("/response", response_model=ResponseAnalysis, response_model_exclude_none=True)
def analyse_response(
    case: CaseDep, session: SessionDep, file: UploadFile = File(...), questions: str | None = Form(None, max_length=5000)
) -> ResponseAnalysis:
    """Upload the PIO's reply (a PDF with selectable text, or .txt) and get, for each of the
    case's stored requests, how the reply dealt with it. The file itself is not stored.

    A case with no requests is a reply to an RTI not drafted here: its requests are the
    `questions` the citizen pasted (one per line), or else the points read from the reply."""
    requests = case_store.load_requests(case, session=session)
    pasted = response_analysis.requests_from_questions(questions or "") if not requests else []
    if not requests and not pasted and not get_settings().use_llm_drafting:
        raise HTTPException(409, "This case has no information requests yet. Draft the application first.")

    data = file.file.read(response_analysis.MAX_BYTES + 1)
    try:
        pages, passages, ocr_used = response_analysis.read_reply(file.filename or "", data)
    except response_analysis.UnreadableReply as error:
        raise HTTPException(422, str(error)) from error

    derived = None
    summary = None
    if requests or pasted:
        derived = None if requests else pasted
        requests = requests or pasted
        if get_settings().use_llm_drafting:
            results, summary = response_analysis.analyse_reply(requests, passages)
        else:
            results = [response_analysis.abstain(request.id, AI_OFF) for request in requests]
    else:
        derived, results, summary = response_analysis.analyse_reply_points(passages)

    case_store.update_case(case, session=session, status=case_store.RESPONSE_ANALYSED)
    return ResponseAnalysis(
        pages=pages, ocr_used=ocr_used, passages=passages, results=results, summary=summary, requests=derived
    )


@router.post("/appeal", response_model=AppealResponse)
def draft_appeal(case: CaseDep, body: AppealBody) -> AppealResponse:
    return AppealResponse(appeal_text=appeal.generate_appeal(case.grievance_text, body.items, body.language))
