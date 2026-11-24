"""Mock drafting logic, identical to src/components/rti-drafting-wizard/mocks.ts.

Each function is replaced by the real implementation in this package; keep the
signatures so the routers don't change.
"""

import re

from app.schemas import ClarifyQuestion, ClarifyResult, InformationRequest, PublicSource

DEFAULT_AUTHORITY = "Public Works Department (PWD), Ward Division Office"

PERIOD_OPTIONS = ["Last 6 months", "Last 1 year", "Last 2 years", "More than 2 years"]

# The one clarifying question the citizen can pick more than one option on (also used by
# app.services.drafting.real, which forces the model's own multi-select question onto this same
# key so both paths agree on it). Chosen options are joined with "; " in the answer.
RECORD_TYPES_KEY = "recordTypes"
RECORD_TYPES_SEPARATOR = "; "

# What each record type actually asks for, keyed by the option text offered in the clarifying
# question -- so decompose_grievance can turn a choice directly into a request, deterministically.
RECORD_TYPE_REQUESTS: dict[str, dict[str, str]] = {
    "Work order for repair": {
        "category": "Work order",
        "title": "Copy of the work order sanctioning repair of the road",
        "quality": "good",
    },
    "Budget/expenditure details": {
        "category": "Expenditure",
        "title": "Details of amount spent",
        "quality": "needs-detail",
    },
    "Inspection report": {
        "category": "Inspection report",
        "title": "Copy of the most recent inspection/quality-check report for the road",
        "quality": "good",
    },
    "Correspondence regarding the issue": {
        "category": "Correspondence",
        "title": "Copies of correspondence exchanged regarding this issue",
        "quality": "good",
    },
}


# "since 2 months", "for the last 3 years", "4 weeks ago" -- loose on purpose, since this is a
# deterministic fallback with no model to lean on, not a full date parser.
_PERIOD_MENTION = re.compile(
    r"\b(?:since|for|over)\s+(?:the\s+)?(?:last|past)?\s*(\d+)\s*(day|week|month|year)s?\b"
    r"|\b(\d+)\s*(day|week|month|year)s?\s+ago\b",
    re.IGNORECASE,
)

# Named Delhi authorities a grievance might already state -- if one is there, the citizen plainly
# already knows which department is responsible, so there is nothing to ask.
_AUTHORITY_MENTION = re.compile(
    r"\b(PWD|Public Works Department|MCD|Municipal Corporation(?: of Delhi)?|NDMC|"
    r"New Delhi Municipal Council|DJB|Delhi Jal Board|DDA|Delhi Development Authority)\b",
    re.IGNORECASE,
)

# Which record types a grievance's own wording points to -- not every grievance mentions any of
# these, in which case the full menu is offered (see _relevant_record_types).
_RECORD_TYPE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "Work order for repair": ("work order", "contractor", "sanction", "tender", "awarded", "repair work"),
    "Budget/expenditure details": ("cost", "spent", "expenditure", "budget", "fund", "money", "rupees"),
    "Inspection report": ("inspect", "quality", "survey", "assess", "check"),
    "Correspondence regarding the issue": (
        "complaint",
        "complained",
        "letter",
        "reply",
        "replied",
        "email",
        "correspond",
        "response",
        "contacted",
    ),
}


def _detected_period(grievance: str) -> str | None:
    match = _PERIOD_MENTION.search(grievance)
    if not match:
        return None
    number = int(match.group(1) or match.group(3))
    unit = (match.group(2) or match.group(4)).lower()
    months = {"day": number / 30, "week": number * 7 / 30, "month": number, "year": number * 12}[unit]
    if months <= 6:
        return "Last 6 months"
    if months <= 12:
        return "Last 1 year"
    if months <= 24:
        return "Last 2 years"
    return "More than 2 years"


def _mentions(grievance: str, keywords: tuple[str, ...]) -> bool:
    # Word boundaries, not a plain substring check: bare "cost" would otherwise match inside
    # "costly" too.
    return any(re.search(rf"\b{re.escape(keyword)}\b", grievance, re.IGNORECASE) for keyword in keywords)


def _relevant_record_types(grievance: str) -> list[str]:
    matched = [
        record_type
        for record_type, keywords in _RECORD_TYPE_KEYWORDS.items()
        if _mentions(grievance, keywords)
    ]
    # Nothing in the wording points to a particular type -- offer the whole menu rather than
    # guess, same as asking the citizen outright.
    return matched or list(RECORD_TYPE_REQUESTS)


def generate_clarify_result(grievance: str) -> ClarifyResult:
    # Not a model, so this reads the grievance with plain keyword/pattern checks rather than
    # understanding it -- but it does read it: what's already stated goes straight to `answers`
    # and is never asked again, and only the options the wording actually points to are offered
    # for the record type, the same shape of behaviour real.generate_clarify_result gets from the
    # model, just rule-based instead of learned.
    answers: dict[str, str] = {}
    questions: list[ClarifyQuestion] = []

    period = _detected_period(grievance)
    if period:
        answers["period"] = period
    else:
        questions.append(
            ClarifyQuestion(key="period", question="What time period does this relate to?", options=PERIOD_OPTIONS)
        )

    if _AUTHORITY_MENTION.search(grievance):
        answers["knowsAuthority"] = "Yes, I know the department"
    else:
        questions.append(
            ClarifyQuestion(
                key="knowsAuthority",
                question="Do you know which government department is responsible?",
                options=["Yes, I know the department", "No, not sure"],
            )
        )

    questions.append(
        ClarifyQuestion(
            key=RECORD_TYPES_KEY,
            question="What type of record are you seeking?",
            options=_relevant_record_types(grievance),
            multi=True,
        )
    )

    return ClarifyResult(answers=answers, questions=questions)


def decompose_grievance(
    _grievance: str, clarification: dict[str, str]
) -> list[InformationRequest]:
    period = clarification.get("period", "Last 1 year")
    chosen = [
        part.strip()
        for part in clarification.get(RECORD_TYPES_KEY, "").split(RECORD_TYPES_SEPARATOR)
        if part.strip() in RECORD_TYPE_REQUESTS
    ]
    # No record-type question was asked (e.g. a follow-up skips Clarify) -- keep the old,
    # unconditional set of three so that path is unaffected.
    types = chosen or list(RECORD_TYPE_REQUESTS)[:3]
    return [
        InformationRequest(
            id=f"RQ-{index:03d}",
            category=RECORD_TYPE_REQUESTS[record_type]["category"],
            title=RECORD_TYPE_REQUESTS[record_type]["title"],
            authority=DEFAULT_AUTHORITY,
            period=period,
            quality=RECORD_TYPE_REQUESTS[record_type]["quality"],
            source="generated",
        )
        for index, record_type in enumerate(types, start=1)
    ]


def check_public_info(requests: list[InformationRequest]) -> list[InformationRequest]:
    checked = []
    for request in requests:
        if request.id == "RQ-001":
            update = {
                "publicly_available": True,
                "public_source": PublicSource(
                    title="Central Public Procurement Portal — awarded tenders & work orders",
                    url="https://eprocure.gov.in/cppp/",
                ),
            }
        else:
            update = {"publicly_available": False, "public_source": None}
        checked.append(request.model_copy(update=update))
    return checked


def generate_draft(requests: list[InformationRequest]) -> str:
    # Subject names the broad category, not the specific record, so it doesn't just repeat
    # "Particulars of information sought" verbatim -- the convention most PIOs expect
    # (e.g. https://blog.ipleaders.in/drafting-an-rti-application/).
    sections = []
    for request in requests:
        background = f"Background: {request.context}\n" if request.context else ""
        sections.append(
            f"Subject: Application under the Right to Information Act, 2005 — {request.category}\n"
            f"Authority: {request.authority}\n"
            f"Particulars of information sought: {request.title}\n"
            f"Period: {request.period}\n"
            f"{background}"
        )
    return "\n---\n\n".join(sections)
