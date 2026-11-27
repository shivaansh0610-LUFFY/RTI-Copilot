"""Read a Public Information Officer's reply and decide, request by request, how it was answered.

read_reply() turns the uploaded file (a PDF with a text layer, or plain text) into numbered
passages. classify_reply() asks the model to label each information request, citing passages.

The model's answer is checked rather than trusted, because the citizen acts on it (pays a fee,
files an appeal): a label that needs evidence but cites no real passage, a request the model
skipped, or an unknown label all become INSUFFICIENT_EVIDENCE, and so does every request when
the model cannot be reached. Nothing is made up to fill a gap.

For a few labels the PIO is making a claim worth checking against the rules, not just the
model's say-so: a claimed exemption, a "no record" answer, or a demanded fee. For those,
_ground() runs a hybrid (vector + keyword) search over the corpus, restricted to the relevant
source types, and attaches the passages as grounding -- the same retrieval app.services.grounding
uses for drafting citations, now reused on the analysis side.
"""

import io
import re
import logging

from app.schemas import InformationRequest
from app.schemas.responses import ClassificationResult, CorpusCitation, ResponsePassage
from app.services import grounding, llm
from ingest.extract import ExtractionError, pdf_pages, split_clauses

logger = logging.getLogger(__name__)

# For these labels the PIO is making a claim that the actual rules can check: a claimed
# exemption may not be one the Act actually allows, a "no record" claim may concern a record the
# manual requires the department to keep, and a demanded fee may not match what the Rules set.
# Each maps to a query against the corpus and the source types worth searching for it.
GROUNDING_QUERIES: dict[str, tuple[str, list[str]]] = {
    "EXEMPTION_CLAIMED": ("exemption from disclosure of information under Section 8 or Section 9", ["act", "rules"]),
    "NO_RECORD_STATED": ("records required to be maintained for this kind of work", ["manual"]),
    "FEE_DEMANDED": ("fee payable for providing information under the RTI Act and Rules", ["act", "rules"]),
}
GROUNDING_PER_LABEL = 2

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
sentence for the citizen. "summary" is 2 to 4 short sentences in plain, everyday words for the \
citizen: what the reply gave, what it says will come later, and what it refused or skipped.

Respond with ONLY one JSON object, no prose, no markdown fences:
{"summary": "...", "results": [{"request_id": "RQ-001", "label": "...", "explanation": "...", \
"evidence": ["P-1"], "abstention_reason": null}, ...]}
One result per request, using the request ids given."""

# When the citizen did not say what they asked (the reply came from an RTI not drafted here),
# the points come from the reply itself.
POINTS_PROMPT = SYSTEM_PROMPT.split("Respond with ONLY")[0].replace(
    "decide, for each information request, how the reply dealt with it.",
    "find the points it answers. The citizen has not told you what they asked, so take the "
    "points from the reply itself: its numbered points, or each separate record or topic it "
    "deals with (at most 10). Give each a short title naming the information, e.g. \"Work order\".",
) + """Respond with ONLY one JSON object, no prose, no markdown fences:
{"summary": "...", "points": [{"title": "...", "label": "...", "explanation": "...", \
"evidence": ["P-1"], "abstention_reason": null}, ...]}"""
MAX_POINTS = 10
MAX_SUMMARY_CHARS = 1200


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
    return analyse_reply(requests, passages)[0]


def analyse_reply(
    requests: list[InformationRequest], passages: list[ResponsePassage]
) -> tuple[list[ClassificationResult], str | None]:
    """classify_reply's results, plus the reply in simple words (None if the model gave none)."""
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
        return [abstain(request.id, UNAVAILABLE) for request in requests], None

    by_id = {str(item.get("request_id")): item for item in items if isinstance(item, dict)}
    by_passage = {passage.id: passage for passage in passages}
    return [_checked(request.id, by_id.get(request.id), by_passage) for request in requests], _summary(payload)


def analyse_reply_points(
    passages: list[ResponsePassage],
) -> tuple[list[InformationRequest], list[ClassificationResult], str | None]:
    """For a reply to an RTI not drafted here, with no questions given: the points the reply
    answers (as requests RQ-001...), a checked result for each, and the reply in simple words."""
    listed_passages = "\n".join(f"[{passage.id}] (page {passage.page}) {passage.text}" for passage in passages)
    try:
        payload = llm.complete_json(POINTS_PROMPT, f"Reply passages:\n{listed_passages[:MAX_PROMPT_CHARS]}", max_tokens=8000)
        items = payload.get("points") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            raise ValueError(f"Expected {{'points': [...]}}, got: {payload!r}")
    except Exception:
        logger.warning("Reading the reply's points failed", exc_info=True)
        return [], [], None

    by_passage = {passage.id: passage for passage in passages}
    requests, results = [], []
    for item in [item for item in items if isinstance(item, dict) and str(item.get("title", "")).strip()][:MAX_POINTS]:
        request = _request(len(requests) + 1, str(item["title"]))
        requests.append(request)
        results.append(_checked(request.id, item, by_passage))
    return requests, results, _summary(payload)


def requests_from_questions(text: str) -> list[InformationRequest]:
    """The questions a citizen pasted, one request per non-empty line, numbering removed."""
    lines = [re.sub(r"^\s*(\(?[0-9a-zA-Z]{1,3}[.)]|[-*\u2022])\s+", "", line).strip() for line in text.splitlines()]
    return [_request(index, line) for index, line in enumerate([line for line in lines if line][:MAX_POINTS], start=1)]


def _request(number: int, title: str) -> InformationRequest:
    return InformationRequest(
        id=f"RQ-{number:03d}", category="From the reply", title=title[:1000], authority="", period="",
        quality="good", source="custom",
    )


def _summary(payload: object) -> str | None:
    summary = payload.get("summary") if isinstance(payload, dict) else None
    if not isinstance(summary, str) or not summary.strip():
        return None
    return summary.strip()[:MAX_SUMMARY_CHARS]


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
        request_id=request_id,
        label=label,
        explanation=explanation or label,
        evidence=evidence,
        grounding=_ground(label),
    )


def _ground(label: str) -> list[CorpusCitation]:
    """Corpus passages that check this finding against the actual rule, or [] when the label
    isn't one worth checking, the corpus has nothing relevant, or the database isn't reachable --
    grounding is a supplementary check, so it never turns a finding itself into a failure."""
    spec = GROUNDING_QUERIES.get(label)
    if spec is None:
        return []
    query, doc_types = spec
    try:
        passages = grounding.passages_for(query, GROUNDING_PER_LABEL, doc_types)
    except Exception:
        logger.warning("Corpus grounding failed for label %s; showing the finding without it", label, exc_info=True)
        return []
    return [
        CorpusCitation(id=passage.id, text=grounding.quote(passage.text), page=passage.page,
                       source_title=passage.source_title, url=passage.url)
        for passage in passages
    ]


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
