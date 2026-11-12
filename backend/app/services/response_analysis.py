"""Read a Public Information Officer's reply and decide, request by request, how it was answered.

read_reply() turns the uploaded file (a PDF with a text layer, or plain text) into numbered
passages. classify_reply() asks the model to label each information request, citing passages.

The model's answer is checked rather than trusted, because the citizen acts on it (pays a fee,
files an appeal): a label that needs evidence but cites no real passage, a request the model
skipped, or an unknown label all become INSUFFICIENT_EVIDENCE, and so does every request when
the model cannot be reached. Nothing is made up to fill a gap.
"""

import io
import logging

from app.schemas import InformationRequest
from app.schemas.responses import ClassificationResult, ResponsePassage
from app.services import llm
from ingest.extract import ExtractionError, pdf_pages, split_clauses

logger = logging.getLogger(__name__)

MAX_BYTES = 10 * 1024 * 1024
MAX_PAGES = 40
# What the model sees of a long reply; replies to a single RTI are usually a few pages.
MAX_PROMPT_CHARS = 40_000

LABELS = {
    "RESPONSIVE",
    "PARTIALLY_RESPONSIVE",
    "NON_RESPONSIVE",
    "NO_RECORD_STATED",
    "EXEMPTION_CLAIMED",
    "TRANSFERRED",
    "FEE_DEMANDED",
    "ATTACHMENT_REFERENCED",
    "INSUFFICIENT_EVIDENCE",
}
# Labels that say the reply did something (gave, refused, transferred...), so they must point
# at the passage where it did. NON_RESPONSIVE means "nothing addresses it", so it has none.
NEEDS_EVIDENCE = LABELS - {"NON_RESPONSIVE", "INSUFFICIENT_EVIDENCE"}

UNAVAILABLE = "The automatic analysis is not available right now. Read the reply yourself, or try again later."

SYSTEM_PROMPT = """You read a Public Information Officer's (PIO's) reply to a Right to \
Information (RTI) Act, 2005 application and decide, for each information request, how the \
reply dealt with it. The reply is split into passages with ids like [P-3].

Labels:
- RESPONSIVE: the reply gives the information or record that was asked for.
- PARTIALLY_RESPONSIVE: it gives some of it but not all (say what is missing).
- NON_RESPONSIVE: nothing in the reply addresses this request.
- NO_RECORD_STATED: the reply says the record does not exist or is not held.
- EXEMPTION_CLAIMED: the reply refuses, citing an exemption (e.g. Section 8 or 9).
- TRANSFERRED: the reply says the request was transferred to another public authority.
- FEE_DEMANDED: the reply asks for a further fee before giving the information.
- ATTACHMENT_REFERENCED: the reply points to an annexure or enclosure instead of answering.
- INSUFFICIENT_EVIDENCE: you cannot tell from the passages (unclear, illegible, ambiguous).

Rules: decide only from the passages, never from what a PIO usually does. For every label \
except NON_RESPONSIVE and INSUFFICIENT_EVIDENCE, list the ids of the passages that show it. \
When unsure, use INSUFFICIENT_EVIDENCE and give abstention_reason. "explanation" is one plain \
sentence for the citizen.

Respond with ONLY one JSON object, no prose, no markdown fences:
{"results": [{"request_id": "RQ-001", "label": "...", "explanation": "...", \
"evidence": ["P-1"], "abstention_reason": null}, ...]}
One result per request, using the request ids given."""


class UnreadableReply(ValueError):
    """The upload has no text to analyse; the message says why, for the citizen."""


def read_reply(filename: str, data: bytes) -> tuple[int, list[ResponsePassage], bool]:
    """The page count, the passages, and whether any page needed OCR, of a reply, numbered
    P-1, P-2, ... in reading order."""
    if len(data) > MAX_BYTES:
        raise UnreadableReply(f"The file is over {MAX_BYTES // (1024 * 1024)} MB.")
    is_pdf = data.startswith(b"%PDF-") or filename.lower().endswith(".pdf")
    ocr_flags: list[bool] = []
    if is_pdf:
        try:
            pages = pdf_pages(io.BytesIO(data), ocr_used=ocr_flags)
        except ExtractionError as error:
            raise UnreadableReply("The PDF could not be read. Is it damaged?") from error
        if len(pages) > MAX_PAGES:
            raise UnreadableReply(f"The PDF has {len(pages)} pages; at most {MAX_PAGES} can be analysed.")
    else:
        try:
            pages = [data.decode("utf-8")]
        except UnicodeDecodeError as error:
            raise UnreadableReply("Only PDF and plain-text (.txt) files can be analysed.") from error

    passages = []
    for page_number, page_text in enumerate(pages, start=1):
        for paragraph_number, text in enumerate(split_clauses(page_text), start=1):
            passages.append(
                ResponsePassage(
                    id=f"P-{len(passages) + 1}", page=page_number, paragraph=paragraph_number, text=text
                )
            )
    if not passages:
        raise UnreadableReply(
            "No text was found in this file, even after OCR -- is the file actually blank, or "
            "too faint/skewed to read?"
        )
    return len(pages), passages, any(ocr_flags)


def classify_reply(
    requests: list[InformationRequest], passages: list[ResponsePassage]
) -> list[ClassificationResult]:
    """One checked result per request, in the order of `requests`."""
    listed_requests = "\n".join(f"{request.id}: {request.title} (period: {request.period})" for request in requests)
    listed_passages = "\n".join(f"[{passage.id}] (page {passage.page}) {passage.text}" for passage in passages)
    user = f"Information requests:\n{listed_requests}\n\nReply passages:\n{listed_passages[:MAX_PROMPT_CHARS]}"
    try:
        payload = llm.complete_json(SYSTEM_PROMPT, user, max_tokens=8000)
        items = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            raise ValueError(f"Expected {{'results': [...]}}, got: {payload!r}")
    except Exception:
        logger.warning("Reply classification failed; marking every request unanswerable", exc_info=True)
        return [abstain(request.id, UNAVAILABLE) for request in requests]

    by_id = {str(item.get("request_id")): item for item in items if isinstance(item, dict)}
    by_passage = {passage.id: passage for passage in passages}
    return [_checked(request.id, by_id.get(request.id), by_passage) for request in requests]


def _checked(request_id: str, item: dict | None, by_passage: dict[str, ResponsePassage]) -> ClassificationResult:
    if item is None:
        return abstain(request_id, "The analysis did not cover this request.")
    label = str(item.get("label", ""))
    if label not in LABELS:
        return abstain(request_id, "The analysis gave no usable answer for this request.")
    cited = item.get("evidence") or []
    evidence = [by_passage[str(passage_id)] for passage_id in cited if str(passage_id) in by_passage]
    explanation = str(item.get("explanation") or "").strip()
    if label in NEEDS_EVIDENCE and not evidence:
        return abstain(request_id, "No passage in the reply could be found to support this finding.")
    if label == "INSUFFICIENT_EVIDENCE":
        reason = str(item.get("abstention_reason") or "").strip() or "The reply is unclear about this request."
        return abstain(request_id, reason, explanation, evidence)
    return ClassificationResult(
        request_id=request_id, label=label, explanation=explanation or label, evidence=evidence
    )


def abstain(
    request_id: str, reason: str, explanation: str = "", evidence: list[ResponsePassage] | None = None
) -> ClassificationResult:
    return ClassificationResult(
        request_id=request_id,
        label="INSUFFICIENT_EVIDENCE",
        explanation=explanation or "It is not clear from the reply how this request was dealt with.",
        evidence=evidence or [],
        abstention_reason=reason,
    )
