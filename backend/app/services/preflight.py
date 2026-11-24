"""The officer check: reads the citizen's requests the way a reluctant Public Information
Officer would, before they are filed, and points out the easy excuses to refuse or delay them.

Two layers:

* Fixed rules (always on, and the whole check when AI drafting is off). They catch the plain
  cases: a "why" question, a request about the future, "all records", personal details, a
  title too short to act on. src/components/rti-drafting-wizard/preflight.ts runs the same
  rules in the browser-only demo; preflight-cases.json next to it holds the cases both must
  agree on.
* The AI, playing the officer. It may only pick from the same list of excuses, and it writes
  a better title for each flagged request. A suggested title is dropped if it invents a date,
  number or [placeholder], or if the rules would still flag it.

What the officer could say and why it works is fixed text below, written against the Act,
never left to the model.
"""

import logging
import re
from dataclasses import dataclass

from app.schemas import InformationRequest
from app.schemas.preflight import PreflightIssue, PreflightItem, PreflightResult
from app.services import llm
from app.services.drafting.specificity import is_vague

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Excuse:
    officer_says: str
    why: str
    section: str
    fix: str


# In the order they are shown.
EXCUSES: dict[str, Excuse] = {
    "QUESTION_NOT_RECORD": Excuse(
        officer_says="The RTI Act gives access to records, not answers to 'why' questions. No information can be provided.",
        why="Information under the Act means material the office already holds. Officers often refuse "
        "'why' and 'explain' questions on this ground.",
        section="Section 2(f)",
        fix="Ask for the records that would show the answer: the file notings, letters, orders or "
        "inspection notes about it.",
    ),
    "CREATES_NEW_INFO": Excuse(
        officer_says="This asks for an opinion or about future plans. No such record exists.",
        why="An officer only has to give records that already exist. They do not have to give opinions "
        "or say what will happen next.",
        section="Section 2(f)",
        fix="Ask for what exists today: the sanction, estimate or approved schedule for the work, or "
        "the letters about it.",
    ),
    "TOO_VAGUE": Excuse(
        officer_says="The request does not make clear which records are sought.",
        why="You must specify the information you want. A vague request gets a general reply, or a "
        "letter asking you to clarify, which costs weeks.",
        section="Section 6(1)",
        fix="Name the record (for example a copy of the bill, the measurement book entry or the "
        "completion certificate) and the road it is about.",
    ),
    "TOO_BROAD": Excuse(
        officer_says="Collecting this would disproportionately divert the resources of the office.",
        why="The Act only lets an officer give information in another form for this reason, but it is "
        "often used to delay or refuse very wide requests.",
        section="Section 7(9)",
        fix="Limit it to this road or stretch, and name the exact records you want.",
    ),
    "PERSONAL_INFO": Excuse(
        officer_says="This is personal information with no relation to any public activity. Exempt.",
        why="Personal details of officials or contractors (home address, phone, tax returns, bank "
        "details) can be refused unless a larger public interest is shown.",
        section="Section 8(1)(j)",
        fix="Ask for the official record instead: the contractor firm named in the work order, or the "
        "official's name and designation.",
    ),
    "NO_PLACE": Excuse(
        officer_says="The road or place this request is about cannot be identified.",
        why="Without a street, landmark or location, the officer can reply that the records cannot be traced.",
        section="Section 6(1)",
        fix="Name the road or a nearby landmark, or pin the location on the map.",
    ),
}

# What each excuse means, for the model.
_MEANINGS = {
    "QUESTION_NOT_RECORD": "asks 'why' or for an explanation instead of an existing record",
    "CREATES_NEW_INFO": "asks for an opinion, a judgement, or what will happen in future, which no record holds",
    "TOO_VAGUE": "does not say which record is wanted, so the officer can reply with something general",
    "TOO_BROAD": "asks for all records, files or works without limit, inviting a 'diverts resources' reply",
    "PERSONAL_INFO": "asks for personal details of an official or contractor (address, phone, tax, bank, medical)",
    "NO_PLACE": "neither the request nor the grievance identifies the road or place",
}

MAX_ISSUES = 3
MAX_TITLE_CHARS = 1000  # InformationRequest.title

# A request for copies of records is a records request even when it mentions why something
# happened ("Copies of the file notings explaining why the work stopped").
_ASKS_FOR_COPIES = re.compile(r"^\s*(certified\s+)?cop(y|ies)\s+of\b", re.IGNORECASE)
_WHY = re.compile(r"\bwhy\b|\bhow\s+come\b|\bexplain\b|\bjustif(y|ication)\b", re.IGNORECASE)
_FUTURE_OR_OPINION = re.compile(
    r"\bwhen\s+will\b|\bby\s+when\b|\bwhat\s+(action|steps)\s+will\b|\bwill\s+(the|you|pwd|it|they)\b"
    r"|\bopinion\b|\bwhether\b.*\b(is|was|are|were)\s+(correct|right|justified|proper|legal)\b",
    re.IGNORECASE,
)
_TOO_BROAD = re.compile(
    r"\b(all|every|entire)\s+(the\s+)?(records|files|documents|information|roads|works|tenders|contracts|complaints)\b"
    r"|\b(across|all\s+over|whole\s+of)\s+delhi\b",
    re.IGNORECASE,
)
_PERSONAL = re.compile(
    r"\b(home|residential)\s+address\b|\b(personal|mobile|phone)\s+numbers?\b|\bpersonal\s+(details|information|life)\b"
    r"|\bincome\s+tax\s+returns?\b|\bmedical\s+records?\b|\bbank\s+(account|details|statements?)\b"
    r"|\bannual\s+confidential\s+reports?\b|\bACRs?\b",
    re.IGNORECASE,
)


def rule_issues(request: InformationRequest) -> list[str]:
    """The excuses the fixed rules find in one request, in EXCUSES order."""
    if request.source == "inspection":
        return []  # our own Section 2(j) wording
    title = request.title
    asks_for_copies = bool(_ASKS_FOR_COPIES.search(title))
    found = set()
    if _WHY.search(title) and not asks_for_copies:
        found.add("QUESTION_NOT_RECORD")
    if _FUTURE_OR_OPINION.search(title) and not asks_for_copies:
        found.add("CREATES_NEW_INFO")
    if request.quality == "needs-detail" or is_vague(title):
        found.add("TOO_VAGUE")
    if _TOO_BROAD.search(title):
        found.add("TOO_BROAD")
    if _PERSONAL.search(title):
        found.add("PERSONAL_INFO")
    return [code for code in EXCUSES if code in found]


SYSTEM_PROMPT = """You are an experienced, reluctant Public Information Officer (PIO) of the \
Public Works Department, Government of NCT of Delhi. You look for lawful-sounding reasons to \
refuse, narrow or delay RTI requests. A citizen shows you their requests BEFORE filing, so \
they can fix them.

For each request, list which of these excuses you could realistically use against it:
{meanings}

Most precise requests for a named record (a copy of the work order, the measurement book \
entries, the bills paid) give you no excuse: return an empty list for those. Never flag a \
request just to have something to say. The requests are filed together with the grievance \
below, which gives the place; a request about "the road" or "the above location" is fine \
when the grievance names the place. A request to inspect the work or to take certified \
samples of material is a valid RTI request (Section 2(j)).

Some excuses were already found by fixed rules; they are listed with each request. For every \
request that has any excuse, write "rewrite": one better title that removes the excuses and \
keeps the citizen's meaning, asking for specific existing records, starting like "Copy of" \
or "Details of". The period is shown separately with every request, so leave time out of \
the title entirely (no "for the last 6 months"). Never invent a date, month, year, amount, \
number or name, and never write a [placeholder]. Use null for "rewrite" when the request \
has no excuse.

Respond with ONLY one JSON object, no prose, no markdown fences:
{{"results": [{{"id": "<request id>", "issues": ["<EXCUSE>", ...], "rewrite": "<title>" | null}}, ...]}}"""


def check_requests(grievance: str, requests: list[InformationRequest], *, use_ai: bool) -> PreflightResult:
    rules = {request.id: rule_issues(request) for request in requests}
    ai: dict[str, tuple[list[str], str | None]] = {}
    ai_used = False
    to_ask = [request for request in requests if request.source != "inspection"]
    if use_ai and to_ask:
        try:
            ai = _ask_model(grievance, to_ask, rules)
            ai_used = True
        except Exception:
            logger.warning("AI officer check failed; using the fixed rules only", exc_info=True)

    items = []
    for request in requests:
        ai_codes, rewrite = ai.get(request.id, ([], None))
        codes = [code for code in EXCUSES if code in set(rules[request.id]) | set(ai_codes)]
        items.append(
            PreflightItem(
                request_id=request.id,
                issues=[_issue(code) for code in codes],
                suggested_title=rewrite if codes else None,
            )
        )
    return PreflightResult(items=items, ai_used=ai_used)


def _issue(code: str) -> PreflightIssue:
    excuse = EXCUSES[code]
    return PreflightIssue(
        code=code, officer_says=excuse.officer_says, why=excuse.why, section=excuse.section, fix=excuse.fix
    )


def _ask_model(
    grievance: str, requests: list[InformationRequest], rules: dict[str, list[str]]
) -> dict[str, tuple[list[str], str | None]]:
    """The model's excuses and rewrite per request id. Raises on a reply that is not the
    expected shape, so the caller falls back to the rules."""
    meanings = "\n".join(f"- {code}: {meaning}" for code, meaning in _MEANINGS.items())
    listed = "\n".join(
        f"- id {request.id}: {request.title} (period: {request.period})"
        + (f" [rules found: {', '.join(rules[request.id])}]" if rules[request.id] else "")
        for request in requests
    )
    payload = llm.complete_json(
        SYSTEM_PROMPT.format(meanings=meanings),
        f"Grievance:\n{grievance}\n\nRequests:\n{listed}",
        max_tokens=6000,
    )
    results = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(results, list):
        raise ValueError(f"Expected {{'results': [...]}}, got: {payload!r}")

    by_id = {request.id: request for request in requests}
    found: dict[str, tuple[list[str], str | None]] = {}
    for result in results:
        if not isinstance(result, dict) or str(result.get("id")) not in by_id:
            continue  # an id we did not send
        request = by_id[str(result["id"])]
        raw = result.get("issues")
        codes = [str(code) for code in raw if str(code) in EXCUSES] if isinstance(raw, list) else []
        found[request.id] = (codes[:MAX_ISSUES], _usable_rewrite(result.get("rewrite"), request))
    return found


def _usable_rewrite(rewrite: object, request: InformationRequest) -> str | None:
    """The model's title, if the citizen could file it as is."""
    # Imported here: real.py imports the corpus search, which this module does not need.
    from app.services.drafting.real import _is_fabricated

    if not isinstance(rewrite, str):
        return None
    title = " ".join(rewrite.split())
    if not 10 <= len(title) <= MAX_TITLE_CHARS or title.lower() == request.title.strip().lower():
        return None
    if _is_fabricated(title):
        return None
    if rule_issues(request.model_copy(update={"title": title, "quality": "good"})):
        return None
    return title
