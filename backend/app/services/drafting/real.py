"""LLM-backed drafting logic. Falls back to app.services.drafting.mock on any
failure (bad JSON, network error, missing key) so a flaky model call never
breaks the endpoint for the citizen filing a request.
"""

import logging

from app.schemas import ClarifyQuestion, InformationRequest
from app.services import llm, public_info
from app.services.drafting import mock
from app.services.drafting.mock import DEFAULT_AUTHORITY

logger = logging.getLogger(__name__)

CLARIFY_SYSTEM_PROMPT = """You help a citizen in Delhi file a Right to Information (RTI) \
Act, 2005 application against the Public Works Department (PWD), Government of NCT of \
Delhi, about a road-infrastructure grievance (e.g. a pothole or an unrepaired road).

Read the grievance and decide what is genuinely missing before it can be broken down into \
specific RTI information requests — for example the exact location, when the problem \
started or was last noticed, whether the citizen already knows which department is \
responsible, or what kind of record they most want (a work order, an inspection report, \
spending figures). Do not ask about things the grievance already states.

Respond with ONLY a JSON array, no prose, no markdown fences, of 1 to 3 questions. Each item:
{"key": "<short camelCase id, e.g. period, location, knowsAuthority>", \
"question": "<the question text>", "options": ["<2 to 4 short selectable answers, not free text>"]}
Exactly one item MUST have "key": "period" with options drawn from or similar to \
["Last 6 months", "Last 1 year", "Last 2 years", "More than 2 years"], since every \
request needs a time period. The rest should be whatever is actually missing for this \
specific grievance — skip a question if the grievance already answers it."""

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


def generate_clarify_questions(grievance: str) -> list[ClarifyQuestion]:
    try:
        items = llm.complete_json(CLARIFY_SYSTEM_PROMPT, f"Grievance: {grievance}")
        if not isinstance(items, list) or not items:
            raise ValueError(f"Expected a non-empty JSON array, got: {items!r}")

        questions = [
            ClarifyQuestion(
                key=str(item["key"]),
                question=str(item["question"]),
                options=[str(option) for option in item["options"]],
            )
            for item in items
        ]
        if not any(question.key == "period" for question in questions):
            raise ValueError("Model did not include a required 'period' question")
        return questions
    except Exception:
        logger.warning("LLM clarify-question generation failed, falling back to mock", exc_info=True)
        return mock.generate_clarify_questions(grievance)


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


def check_public_info(requests: list[InformationRequest]) -> list[InformationRequest]:
    try:
        return public_info.check_public_info(requests)
    except Exception:
        logger.warning("Public-info lookup failed, falling back to mock", exc_info=True)
        return mock.check_public_info(requests)
