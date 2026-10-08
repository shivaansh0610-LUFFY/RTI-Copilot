"""LLM-backed drafting logic. Falls back to app.services.drafting.mock on any
failure (bad JSON, network error, missing key) so a flaky model call never
breaks the endpoint for the citizen filing a request.
"""

import logging

from app.schemas import InformationRequest
from app.services import llm
from app.services.drafting import mock
from app.services.drafting.mock import DEFAULT_AUTHORITY

logger = logging.getLogger(__name__)

DECOMPOSE_SYSTEM_PROMPT = """You help a citizen in Delhi file a Right to Information \
(RTI) Act, 2005 application against the Public Works Department (PWD), Government of \
NCT of Delhi, about a road-infrastructure grievance (e.g. a pothole or an unrepaired \
road).

Given the citizen's grievance and their answers to clarifying questions, break it down \
into a list of specific RTI information requests a Public Information Officer (PIO) can \
act on directly. Each request must ask for a concrete, existing record (a document, \
order, report, or figure) — RTI compels disclosure of records, not explanations, so \
never phrase a request as "why" something happened.

Respond with ONLY a JSON array, no prose, no markdown fences. Each item:
{"category": "<short label, e.g. Work order>", "title": "<the record being requested>", \
"quality": "good" | "needs-detail"}
Use "needs-detail" only when the title is still too vague for a PIO to act on without \
more specifics (e.g. it is missing a location or date range); otherwise "good".
Produce between 2 and 5 items that actually fit the stated grievance (e.g. the work \
order sanctioning the repair, amount spent, inspection/quality-check reports — whichever \
apply)."""


def decompose_grievance(grievance: str, clarification: dict[str, str]) -> list[InformationRequest]:
    period = clarification.get("period", "Last 1 year")
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
