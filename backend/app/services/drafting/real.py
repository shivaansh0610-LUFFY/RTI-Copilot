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

_MONTH_NAMES = (
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december", "jan", "feb", "mar", "apr",
    "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
)
# The prompt tells the model never to invent a specific calendar date, but it does not
# reliably obey that (seen in practice: "between 1 July 2023 and 30 September 2023" for a
# period the citizen only described as "Last 3 months"). Catching it here, not just asking
# nicely, is what actually keeps a fabricated date out of a request the citizen files.
_FABRICATED_DATE = re.compile(r"\b(" + "|".join(_MONTH_NAMES) + r")\b|\b(19|20)\d{2}\b", re.IGNORECASE)
# Also seen in practice: "street light pole number [pole number]" (a fill-in-the-blank slot
# the model has no value for, left as literal brackets) and "for the past six months" in a
# title alongside a period of "Last 3 months" the citizen actually chose. Both are the model
# inventing specifics it doesn't have, same as a fabricated date.
_PLACEHOLDER = re.compile(r"\[[^\]]+\]")
_DURATION_PHRASE = re.compile(r"\b(last|past|previous)\s+\w+\s+(day|week|month|year)s?\b", re.IGNORECASE)


def _is_fabricated(title: str) -> bool:
    return bool(_FABRICATED_DATE.search(title) or _PLACEHOLDER.search(title) or _DURATION_PHRASE.search(title))

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
act on directly. Each title must read as a request for a record, starting with something \
like "Copy of", "Details of" or "Record of" — never as a statement describing what that \
record says or when it was made, since you do not actually have the record yet. RTI \
compels disclosure of records, not explanations, so never phrase a request as "why" \
something happened. Use the clarifying answers to make requests more specific (e.g. \
naming the location or asset they identify), not just the period.

Never invent a specific calendar date, month or year (e.g. "between April 2023 and \
September 2023") — you do not know the real dates and stating one as fact would be \
misleading. The period the citizen chose (e.g. "Last 3 months") is tracked separately \
and shown alongside every request, so leave time out of the title entirely — do not \
restate it even in relative terms ("for the last three months", "during the past six \
months"), and never state a different duration than the one the citizen actually chose.

Never write a placeholder like "[pole number]" or "[date]" for a detail you don't have — \
if you don't know it, either leave it out and describe the asset by location instead, or \
mark the item "needs-detail" and let the citizen fill it in themselves; a literal \
bracketed placeholder cannot be filed as is.

Respond with ONLY a JSON array, no prose, no markdown fences. Each item:
{"category": "<short label, e.g. Work order>", "title": "<the record being requested>", \
"quality": "good" | "needs-detail"}
Use "needs-detail" only when the title is still too vague for a PIO to act on without \
more specifics (e.g. it is missing a location); otherwise "good".
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

        titles = [str(item["title"]) for item in items]
        fabricated = [title for title in titles if _is_fabricated(title)]
        if fabricated:
            raise ValueError(f"Model invented a date, duration or placeholder in: {fabricated!r}")

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


def check_public_info(requests: list[InformationRequest]) -> list[InformationRequest]:
    try:
        return public_info.check_public_info(requests)
    except Exception:
        logger.warning("Public-info lookup failed, falling back to mock", exc_info=True)
        return mock.check_public_info(requests)
