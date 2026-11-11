"""Draft a First Appeal under Section 19(1) of the RTI Act, 2005 from the reply analysis.

The model writes the grounds; the registration number, dates, name and address stay as
[placeholders] for the citizen to fill in, because the app does not know them and must never
guess them. On any failure, or when the model's grounds do not match the items one for one,
the plain template below is returned instead.
"""

import logging
import re

from app.config import get_settings
from app.schemas.responses import AppealItem
from app.services import llm

logger = logging.getLogger(__name__)

AUTHORITY = "Public Works Department (PWD), Government of NCT of Delhi"
NUMBERED_ITEM = re.compile(r"^\s*(\d+)[.)]\s", re.MULTILINE)
PLACEHOLDERS = ("[registration number]", "[date of application]", "[date of reply]")

LABEL_TEXT = {
    "PARTIALLY_RESPONSIVE": "only partly answered",
    "NON_RESPONSIVE": "not answered at all",
    "NO_RECORD_STATED": "said to have no record",
    "EXEMPTION_CLAIMED": "refused under an exemption",
    "TRANSFERRED": "transferred",
    "FEE_DEMANDED": "a further fee was demanded",
    "ATTACHMENT_REFERENCED": "referred to an attachment",
    "INSUFFICIENT_EVIDENCE": "not clearly answered",
    "RESPONSIVE": "answered",
}

SYSTEM_PROMPT = """You write a First Appeal under Section 19(1) of the Right to Information \
Act, 2005 to the First Appellate Authority of the {authority}, for a citizen whose RTI \
application was not fully answered by the Public Information Officer (PIO).

Write it as a short formal letter:
- "To, The First Appellate Authority, {authority}", then a subject line naming Section 19(1).
- Keep these placeholders exactly as written, never fill them in: [registration number], \
[date of application], [date of reply], [Your name], [Your address], [Date].
- Then exactly {count} numbered grounds ("1.", "2.", ...), one per item given to you, in \
the same order: what was asked, and what the reply did wrong, using the finding given.
- Ask that the PIO be directed to provide the complete information sought.

Never invent facts: no names, dates, amounts or numbers that are not given to you. Plain \
text, no markdown, at most 2,500 characters. {language}

Respond with ONLY one JSON object, no prose, no markdown fences: {{"appeal": "<the text>"}}"""

LANGUAGES = {"en": "Write in English.", "hi": "Write in Hindi (Devanagari script)."}


def generate_appeal(grievance: str, items: list[AppealItem], language: str = "en") -> str:
    if not get_settings().use_llm_drafting:
        return template_appeal(items)
    listed = "\n".join(
        f"{index}. {item.title} | finding: {LABEL_TEXT.get(item.label, item.label)} | {item.explanation}"
        for index, item in enumerate(items, start=1)
    )
    system = SYSTEM_PROMPT.format(
        authority=AUTHORITY, count=len(items), language=LANGUAGES.get(language, LANGUAGES["en"])
    )
    try:
        payload = llm.complete_json(system, f"Grievance:\n{grievance}\n\nItems:\n{listed}", max_tokens=6000)
        appeal = payload.get("appeal") if isinstance(payload, dict) else None
        if not isinstance(appeal, str) or not appeal.strip():
            raise ValueError(f"Expected {{'appeal': <text>}}, got: {payload!r}")
        # The grounds come first; a second numbered list after them (the relief sought) is fine.
        numbers = [int(number) for number in NUMBERED_ITEM.findall(appeal)]
        if numbers[: len(items)] != list(range(1, len(items) + 1)):
            raise ValueError(f"Expected grounds 1..{len(items)}, got {numbers}")
        return appeal.strip()
    except Exception:
        logger.warning("LLM appeal drafting failed, falling back to the template", exc_info=True)
        return template_appeal(items)


def template_appeal(items: list[AppealItem]) -> str:
    grounds = "\n".join(
        f"{index}. {item.title}: {LABEL_TEXT.get(item.label, item.label)}. {item.explanation}"
        for index, item in enumerate(items, start=1)
    )
    return (
        f"To,\nThe First Appellate Authority,\n{AUTHORITY}\n\n"
        "Subject: First appeal under Section 19(1) of the Right to Information Act, 2005\n\n"
        "RTI application registration no.: [registration number]\n"
        "Date of application: [date of application]\n"
        "Date of the PIO's reply: [date of reply]\n\n"
        "I appeal against the reply of the Public Information Officer, which did not provide "
        "the information I asked for, on these grounds:\n\n"
        f"{grounds}\n\n"
        "I request that the Public Information Officer be directed to provide the complete "
        "information sought in the points above.\n\n"
        "[Your name]\n[Your address]\n[Date]"
    )
