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
    `questions` the citizen pasted (one per line), or else the points read from the reply. They
    are saved to the case, with who sent the reply, so a follow-up RTI or an appeal can use them."""
    llm_on = get_settings().use_llm_drafting
    requests = case_store.load_requests(case, session=session)
    direct = not requests
    if direct:
        requests = response_analysis.requests_from_questions(questions or "")
        if len(requests) > response_analysis.MAX_QUESTIONS:
            raise HTTPException(
                422, f"Paste at most {response_analysis.MAX_QUESTIONS} questions; this has {len(requests)}."
            )
        if not requests and not llm_on:
            raise HTTPException(
                409,
                "Reading a reply without your questions needs the AI, which is switched off on this "
                "server. Paste the questions you asked, or draft the application first.",
            )

    data = file.file.read(response_analysis.MAX_BYTES + 1)
    try:
        pages, passages, ocr_used = response_analysis.read_reply(file.filename or "", data)
    except response_analysis.UnreadableReply as error:
        raise HTTPException(422, str(error)) from error

    if not requests:
        reading = response_analysis.analyse_reply_points(passages)
        if not reading.results:
            # Nothing is marked analysed: the citizen can paste their questions, or try again.
            raise HTTPException(
                422, "We couldn't read the points of this reply. Paste what you asked, or try again in a minute."
            )
    elif llm_on:
        reading = response_analysis.analyse_reply(requests, passages)
    else:
        reading = response_analysis.Reading(
            requests, [response_analysis.abstain(request.id, AI_OFF) for request in requests]
        )

    saved = None
    if direct:
        saved = response_analysis.for_follow_up(reading.requests, reading.authority)
        case_store.save_requests(case, saved, session=session, commit=False)
    case_store.update_case(case, session=session, status=case_store.RESPONSE_ANALYSED)
    return ResponseAnalysis(
        pages=pages,
        ocr_used=ocr_used,
        passages=passages,
        results=reading.results,
        summary=reading.summary,
        requests=saved,
        authority=reading.authority if direct else None,
        partial=True if reading.partial else None,
    )


@router.post("/appeal", response_model=AppealResponse)
def draft_appeal(case: CaseDep, body: AppealBody) -> AppealResponse:
    return AppealResponse(
        appeal_text=appeal.generate_appeal(
            case.grievance_text, body.items, body.language, authority=body.authority, from_reply=body.from_reply
        )
    )
