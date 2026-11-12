"""LLM-backed drafting logic. Falls back to app.services.drafting.mock on any
failure (bad JSON, network error, missing key) so a flaky model call never
breaks the endpoint for the citizen filing a request.
"""

import logging
import re
from datetime import date

from app.config import get_settings
from app.schemas import Citation, ClarifyQuestion, ClarifyResult, InformationRequest
from app.services import grounding, llm, public_info
from app.services.drafting import mock
from app.services.drafting.mock import DEFAULT_AUTHORITY

logger = logging.getLogger(__name__)

_MONTH_NAMES = (
    "january", "february", "march", "april", "june", "july", "august",
    "september", "october", "november", "december", "jan", "feb", "mar", "apr",
    "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
)
# The prompt tells the model never to invent a specific calendar date, but it does not
# reliably obey that (seen in practice: "between 1 July 2023 and 30 September 2023" for a
# period the citizen only described as "Last 3 months"). Catching it here, not just asking
# nicely, is what actually keeps a fabricated date out of a request the citizen files.
# "May" is also an ordinary word ("as may be required"), so it counts only next to a number.
_FABRICATED_DATE = re.compile(
    r"\b(" + "|".join(_MONTH_NAMES) + r")\b|\b(19|20)\d{2}\b|\b\d{1,2}\s+may\b|\bmay\s+\d{1,4}\b",
    re.IGNORECASE,
)
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
naming the location or asset they identify), not just the period. Name the place by its \
street or landmark; never put map coordinates in a title.

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


GROUNDING_INSTRUCTIONS = """

You are also given numbered passages from the official corpus (the RTI Act and the CPWD \
Works Manuals). Add a "basis" field to each item: the id of the one passage (e.g. "S-2") \
which shows that this kind of record is kept or required, for example a rule that \
measurements are recorded in a Measurement Book, so the citizen can show the PIO the record \
should exist. Where a passage names a specific record, ask for that record by name. Use null \
when no passage shows this; never cite a passage that is merely on the same topic."""

MAX_REQUESTS = 6
MAX_CATEGORY_CHARS = 80  # the width of requests.category


def _corpus_passages(grievance: str) -> list[grounding.CorpusPassage]:
    """The passages to offer as citations, or none (citations off, or the corpus unavailable)."""
    if not get_settings().use_corpus_citations:
        return []
    try:
        return grounding.relevant_passages(grievance)
    except Exception:
        logger.warning("Corpus search failed; decomposing without citations", exc_info=True)
        return []


def _citation(passage: grounding.CorpusPassage | None) -> Citation | None:
    if passage is None:
        return None
    return Citation(
        source_title=passage.source_title, url=passage.url, page=passage.page, quote=grounding.quote(passage.text)
    )


def todays_date_line() -> str:
    """The model does not know today's date and, asked for "the last 6 months", made up dates
    two years in the past. Every prompt that may mention dates gets this line."""
    today = date.today()
    return (
        f"Today's date is {today.day} {today:%B %Y}. Count any exact dates back from today; "
        "if unsure, keep the period in words."
    )


def decompose_grievance(grievance: str, clarification: dict[str, str]) -> list[InformationRequest]:
    period = clarification.get("period", "Last 1 year")
    if clarification:
        answers = "\n".join(f"- {key}: {value}" for key, value in clarification.items())
        user_prompt = f"Grievance: {grievance}\nClarifying answers:\n{answers}"
    else:
        user_prompt = f"Grievance: {grievance}\nPeriod of interest: {period}"

    passages = _corpus_passages(grievance)
    system = DECOMPOSE_SYSTEM_PROMPT
    if passages:
        system += GROUNDING_INSTRUCTIONS
        listed = "\n".join(f"[{p.id}] ({p.source_title}, PDF page {p.page}) {p.text}" for p in passages)
        user_prompt += f"\n\nOfficial passages:\n{listed}"
    by_id = {passage.id: passage for passage in passages}

    try:
        items = llm.complete_json(system, user_prompt, max_tokens=6000)
        if not isinstance(items, list) or not items:
            raise ValueError(f"Expected a non-empty JSON array, got: {items!r}")

        titles = [str(item["title"]) for item in items]
        fabricated = [title for title in titles if _is_fabricated(title)]
        if fabricated:
            raise ValueError(f"Model invented a date, duration or placeholder in: {fabricated!r}")

        return [
            InformationRequest(
                id=f"RQ-{index:03d}",
                category=str(item["category"])[:MAX_CATEGORY_CHARS],
                title=str(item["title"]),
                authority=DEFAULT_AUTHORITY,
                period=period,
                quality=item.get("quality") if item.get("quality") in ("good", "needs-detail") else "good",
                source="generated",
                # Only a passage that was actually offered; an id the model made up cites nothing.
                basis=_citation(by_id.get(str(item.get("basis")))),
            )
            for index, item in enumerate(items[:MAX_REQUESTS], start=1)
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
top, as "Location concerned: <place> (<coordinates>)". In the items, refer to it by \
place name only ("the above location", the street); never repeat the coordinates.
- Then exactly {count} numbered items ("1.", "2.", ...), one per information request \
given to you, in the same order. Each item asks for a specific existing record (a \
certified copy, a figure, a date, a report) for the stated period. Keep each request's \
meaning; make it precise, never vaguer. Never ask "why". If a request says which \
document the record is kept under, you may say so, naming that document exactly as given \
(no paragraph numbers).
- Close by asking that, if any information is held by another public authority, the \
application be transferred under Section 6(3) of the Act.

Never invent facts: no names, dates, amounts, file or work-order numbers that are not in \
the grievance or the requests. Plain text only, no markdown. At most 2,500 characters. \
{language}

Respond with ONLY one JSON object, no prose, no markdown fences: {{"draft": "<the text>"}}"""

LANGUAGES = {
    "en": "Write in English.",
    "hi": (
        "Write every part in Hindi (Devanagari script), including the opening, the location label "
        '(write "संबंधित स्थान:" instead of "Location concerned:") and the closing. Keep only '
        "proper names and record names such as Measurement Book in English, in brackets after "
        "the Hindi term."
    ),
}
NUMBERED_ITEM = re.compile(r"^\s*(\d+)[.)]\s", re.MULTILINE)


def generate_draft(grievance: str, requests: list[InformationRequest], language: str = "en") -> str:
    """The application text, written by the model. Falls back to the template on any failure,
    and also when the model did not give exactly one numbered item per request (it merged,
    dropped or invented one), since the citizen would be filing something they did not ask for."""
    listed = "\n".join(
        f"{index}. [{request.category}] {request.title} (period: {request.period})"
        + (f" (background: {request.context})" if request.context else "")
        + (f" (record kept under: {request.basis.source_title})" if request.basis else "")
        for index, request in enumerate(requests, start=1)
    )
    system = DRAFT_SYSTEM_PROMPT.format(count=len(requests), language=LANGUAGES.get(language, LANGUAGES["en"]))
    try:
        payload = llm.complete_json(
            system,
            f"Grievance:\n{grievance}\n\nInformation requests:\n{listed}\n\n{todays_date_line()}",
            max_tokens=6000,
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
