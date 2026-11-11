"""LLM-backed drafting logic. Falls back to app.services.drafting.mock on any
failure (bad JSON, network error, missing key) so a flaky model call never
breaks the endpoint for the citizen filing a request.
"""

import logging
import re

from app.schemas import ClarifyQuestion, ClarifyResult, InformationRequest
from app.services import llm, public_info
from app.services.drafting import mock
from app.services.drafting.mock import DEFAULT_AUTHORITY

logger = logging.getLogger(__name__)

CLARIFY_SYSTEM_PROMPT = """You help a citizen in Delhi file a Right to Information (RTI) \
Act, 2005 application against the Public Works Department (PWD), Government of NCT of \
Delhi, about a road-infrastructure grievance (e.g. a pothole or an unrepaired road).

Read the grievance and work out, for a request to be properly drafted, what is already \
known and what is genuinely still missing — for example the exact location, how long the \
problem has lasted, whether the citizen already knows which department is responsible, or \
what kind of record they most want (a work order, an inspection report, spending figures).

Respond with ONLY one JSON object, no prose, no markdown fences:
{"answers": {"<key>": "<value>", ...}, "questions": [{"key": "...", "question": "...", \
"options": ["...", "..."]}, ...]}

"answers" holds anything the grievance ALREADY states clearly, in your own normalized \
words — put it there directly and do NOT also ask a question about it. For example, if \
the grievance says "since 2 months", put {"period": "Last 2 months"} in answers and do \
not include a period question. If it names a street, put the location in answers too.

"questions" holds only what is genuinely still missing, 0 to 3 of them. The citizen can \
only click one of your options — there is no text box, so never write an option like \
"Other (specify)" or "Something else" that expects them to type an answer; every option \
must be a complete, useful answer on its own. A time period is always needed, so if the \
grievance does not already state one clearly enough for "answers", include a period \
question with generic buckets like ["Last 6 months", "Last 1 year", "Last 2 years", \
"More than 2 years"] — but never ask it if "answers" already has "period"."""

DECOMPOSE_SYSTEM_PROMPT = """You help a citizen in Delhi file a Right to Information \
(RTI) Act, 2005 application against the Public Works Department (PWD), Government of \
NCT of Delhi, about a road-infrastructure grievance (e.g. a pothole or an unrepaired \
road).

Given the citizen's grievance and their answers to clarifying questions, break it down \
into a list of specific RTI information requests a Public Information Officer (PIO) can \
act on directly. Each request must ask for a concrete, existing record (a document, \
order, report, or figure) — RTI compels disclosure of records, not explanations, so \
never phrase a request as "why" something happened. Use the clarifying answers to make \
requests more specific (e.g. naming the location or asset they identify), not just the \
period.

Respond with ONLY a JSON array, no prose, no markdown fences. Each item:
{"category": "<short label, e.g. Work order>", "title": "<the record being requested>", \
"quality": "good" | "needs-detail"}
Use "needs-detail" only when the title is still too vague for a PIO to act on without \
more specifics (e.g. it is missing a location or date range); otherwise "good".
Produce between 2 and 5 items that actually fit the stated grievance (e.g. the work \
order sanctioning the repair, amount spent, inspection/quality-check reports — whichever \
apply)."""


def generate_clarify_result(grievance: str) -> ClarifyResult:
    try:
        payload = llm.complete_json(CLARIFY_SYSTEM_PROMPT, f"Grievance: {grievance}")
        if not isinstance(payload, dict):
            raise ValueError(f"Expected a JSON object, got: {payload!r}")

        answers = {str(key): str(value) for key, value in dict(payload.get("answers") or {}).items()}
        questions = [
            ClarifyQuestion(
                key=str(item["key"]),
                question=str(item["question"]),
                options=[str(option) for option in item["options"]],
            )
            for item in payload.get("questions") or []
        ]
        if "period" not in answers and not any(question.key == "period" for question in questions):
            raise ValueError("Model resolved 'period' neither in answers nor as a question")
        return ClarifyResult(answers=answers, questions=questions)
    except Exception:
        logger.warning("LLM clarify-result generation failed, falling back to mock", exc_info=True)
        return mock.generate_clarify_result(grievance)


def decompose_grievance(grievance: str, clarification: dict[str, str]) -> list[InformationRequest]:
    period = clarification.get("period", "Last 1 year")
    if clarification:
        answers = "\n".join(f"- {key}: {value}" for key, value in clarification.items())
        user_prompt = f"Grievance: {grievance}\nClarifying answers:\n{answers}"
    else:
        user_prompt = f"Grievance: {grievance}\nPeriod of interest: {period}"

    try:
        items = llm.complete_json(DECOMPOSE_SYSTEM_PROMPT, user_prompt)
        if not isinstance(items, list) or not items:
            raise ValueError(f"Expected a non-empty JSON array, got: {items!r}")

        return [
            InformationRequest(
                id=f"RQ-{index:03d}",
                category=str(item["category"]),
                title=str(item["title"]),
                authority=DEFAULT_AUTHORITY,
                period=period,
                quality=item.get("quality") if item.get("quality") in ("good", "needs-detail") else "good",
                source="generated",
            )
            for index, item in enumerate(items, start=1)
        ]
    except Exception:
        logger.warning("LLM decomposition failed, falling back to mock", exc_info=True)
        return mock.decompose_grievance(grievance, clarification)


DRAFT_SYSTEM_PROMPT = """You write the text of a Right to Information (RTI) application \
under the RTI Act, 2005 to the Public Information Officer (PIO) of the Public Works \
Department (PWD), Government of NCT of Delhi, for a citizen with a road-infrastructure \
grievance. The citizen pastes your text into the "text of application" box of an online \
RTI portal, which also collects their name, address and fee separately, so never add \
placeholders for those.

Write it like this:
- Open with one sentence requesting information under Section 6(1) of the RTI Act, 2005.
- If the grievance has a line starting "Location:", state the location once, near the \
top, as "Location concerned: <place> (<coordinates>)", and refer to it in the items.
- Then exactly {count} numbered items ("1.", "2.", ...), one per information request \
given to you, in the same order. Each item asks for a specific existing record (a \
certified copy, a figure, a date, a report) for the stated period. Keep each request's \
meaning; make it precise, never vaguer. Never ask "why".
- Close by asking that, if any information is held by another public authority, the \
application be transferred under Section 6(3) of the Act.

Never invent facts: no names, dates, amounts, file or work-order numbers that are not in \
the grievance or the requests. Plain text only, no markdown. At most 2,500 characters. \
{language}

Respond with ONLY one JSON object, no prose, no markdown fences: {{"draft": "<the text>"}}"""

LANGUAGES = {"en": "Write in English.", "hi": "Write in Hindi (Devanagari script)."}
NUMBERED_ITEM = re.compile(r"^\s*(\d+)[.)]\s", re.MULTILINE)


def generate_draft(grievance: str, requests: list[InformationRequest], language: str = "en") -> str:
    """The application text, written by the model. Falls back to the template on any failure,
    and also when the model did not give exactly one numbered item per request (it merged,
    dropped or invented one), since the citizen would be filing something they did not ask for."""
    listed = "\n".join(
        f"{index}. [{request.category}] {request.title} (period: {request.period})"
        + (f" (background: {request.context})" if request.context else "")
        for index, request in enumerate(requests, start=1)
    )
    system = DRAFT_SYSTEM_PROMPT.format(count=len(requests), language=LANGUAGES.get(language, LANGUAGES["en"]))
    try:
        payload = llm.complete_json(
            system, f"Grievance:\n{grievance}\n\nInformation requests:\n{listed}", max_tokens=6000
        )
        draft = payload.get("draft") if isinstance(payload, dict) else None
        if not isinstance(draft, str) or not draft.strip():
            raise ValueError(f"Expected {{'draft': <text>}}, got: {payload!r}")
        numbers = [int(number) for number in NUMBERED_ITEM.findall(draft)]
        if numbers != list(range(1, len(requests) + 1)):
            raise ValueError(f"Expected items 1..{len(requests)}, got {numbers}")
        return draft.strip()
    except Exception:
        logger.warning("LLM draft generation failed, falling back to the template", exc_info=True)
        return mock.generate_draft(requests)


def check_public_info(requests: list[InformationRequest]) -> list[InformationRequest]:
    try:
        return public_info.check_public_info(requests)
    except Exception:
        # Not the mock: it marks RQ-001 public with a made-up citation, and a false "already
        # public" sends the citizen away with nothing. A failed lookup means "not checked".
        logger.warning("Public-info lookup failed; marking every request as not checked", exc_info=True)
        return [
            request.model_copy(update={"publicly_available": None, "public_source": None}) for request in requests
        ]
