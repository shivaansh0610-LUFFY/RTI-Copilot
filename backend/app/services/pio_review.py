"""PIO review: reads a whole RTI application the way a Public Information Officer would and
scores it out of 10, before it is filed.

The officer check (app.services.preflight) looks at each request on its own, before the draft
exists. This looks at the finished letter -- the citizen's draft from the wizard, or any
application pasted in -- and catches what only shows there: no mention of the Act, no period,
over the portal's limit, blanks left in, no Section 6(3) line.

Ten fixed checks, one point each, so the score is never a guess: "7/10" means seven of these
ten passed, and each failed one says why and how to fix it. The score is not a chance of
getting a reply -- the PIO must reply to every application (Section 7(1)); what a good draft
changes is whether that reply is useful.

The AI may point out problems in individual numbered points, but only from the same fixed list
of excuses, and only beside the score, never in it; and it may propose an improved version of
the whole letter. That version is dropped
unless it keeps every numbered point, every number and the location, adds no period, date or
[blank] of its own, stays in the same language, and passes every check the original passed.
"""

import logging
import re
from dataclasses import dataclass

from app.schemas import InformationRequest
from app.schemas.review import AiNote, DraftReview, ImprovedDraft, PointNote, ReviewCheck
from app.services import llm
from app.services.preflight import EXCUSES, rule_issues

logger = logging.getLogger(__name__)

PORTAL_CHAR_LIMIT = 3000  # the RTI Online portal's text box
MAX_REVIEW_CHARS = 12000  # longest text accepted for review (a long application filed on paper)


@dataclass(frozen=True)
class Check:
    id: str
    label: str  # what a pass means, shown with a tick
    why: str  # why it matters, shown when it fails
    section: str | None  # the provision behind it; None for the portal's own rules
    fix: str


CHECKS: list[Check] = [
    Check(
        "RTI_ACT",
        "Says it is an RTI application under Section 6(1)",
        "Without naming the Act, the office can treat it as an ordinary letter, with no 30-day deadline.",
        "Section 6(1)",
        "Start with: \"I hereby request information under Section 6(1) of the Right to Information Act, 2005.\"",
    ),
    Check(
        "NUMBERED",
        "Each request is a separate numbered point",
        "The PIO has to answer every point. Numbered points make a skipped one obvious, and easy to appeal.",
        None,
        "Put each record you want on its own line: 1., 2., 3. ...",
    ),
    Check(
        "PORTAL_LIMIT",
        "Fits the online portal (3,000 characters)",
        "The RTI Online portal's text box takes 3,000 characters. Longer text has to go as a PDF attachment.",
        None,
        "Shorten it, or file the longer text as a PDF attachment.",
    ),
    Check(
        "PERIOD",
        "Gives a time period",
        "Without a period the PIO can say the records are too many to collect, or ask you to clarify, "
        "which costs weeks.",
        "Section 6(1)",
        "Add the period you mean, for example \"for the last 1 year\".",
    ),
    Check(
        "PLACE",
        "Names the road or place",
        "Without a street, landmark or location, the officer can reply that the records cannot be traced.",
        "Section 6(1)",
        "Name the road or a nearby landmark, or add a \"Location:\" line.",
    ),
    Check(
        "TRANSFER",
        "Asks for transfer if another office holds the records",
        "Without it, a reply of \"not our department\" is easy. The Act already requires transfer within "
        "5 days; asking for it removes that excuse.",
        "Section 6(3)",
        "End with: \"If any of the requested information is held by another public authority, please transfer "
        "this application to it under Section 6(3) of the Act.\"",
    ),
    Check(
        "NO_BLANKS",
        "No blanks or placeholders left in",
        "An application with [Your name] or ____ still in it looks unfinished and can be returned.",
        None,
        "Fill in or delete every blank.",
    ),
    Check(
        "ASKS_FOR_RECORDS",
        "Asks for records, not explanations or complaints",
        "The Act gives access to records the office holds. 'Why' questions, questions about the future and "
        "accusations are easy to refuse, or to forward as a grievance instead of answering.",
        "Section 2(f)",
        "Ask for the record that would show the answer: the file notings, orders, letters or inspection notes.",
    ),
    Check(
        "SPECIFIC",
        "Each request names a specific record, and is not too broad",
        "A vague request gets a general reply; a very wide one gets \"this would divert the resources of the "
        "office\".",
        "Sections 6(1) and 7(9)",
        "Name the record (the work order, the Measurement Book entries, the bills) and limit it to this road.",
    ),
    Check(
        "NO_PERSONAL_INFO",
        "Does not ask for personal details of officials or contractors",
        "Home addresses, phone numbers, tax or bank details can be refused unless a larger public interest "
        "is shown.",
        "Section 8(1)(j)",
        "Ask for the official record instead: the firm named in the work order, or the officer's designation.",
    ),
]
CHECK_IDS = [check.id for check in CHECKS]

# Which point-level excuses fail which check.
POINT_CHECK = {
    "QUESTION_NOT_RECORD": "ASKS_FOR_RECORDS",
    "CREATES_NEW_INFO": "ASKS_FOR_RECORDS",
    "COMPLAINT_TONE": "ASKS_FOR_RECORDS",
    "TOO_VAGUE": "SPECIFIC",
    "TOO_BROAD": "SPECIFIC",
    "NO_PLACE": "SPECIFIC",
    "PERSONAL_INFO": "NO_PERSONAL_INFO",
}
COMPLAINT_SAYS = "This is a complaint, not a request for information. Forwarded to the grievance cell."

# --- the fixed rules ---------------------------------------------------------------------------

_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_RTI_ACT = re.compile(
    r"section\s*6\s*\(\s*1\s*\)|right\s+to\s+information\s+act|\bRTI\s+Act\b|धारा\s*6\s*\(\s*1\s*\)|सूचना\s+का\s+अधिकार",
    re.IGNORECASE,
)
_POINT = re.compile(r"^\s*(\d{1,2})\s*[.)]\s+(.+)$")
_PERIOD = re.compile(
    r"\b(day|week|month|year)s?\b|\b(19|20)\d{2}\b|\bsince\b|\bperiod\b|\bfrom\s+\S+.{0,40}\bto\b|\btill\b|\buntil\b"
    r"|\bdated\b|महीन|वर्ष|साल|अवधि|से\s+\S+\s+तक",
    re.IGNORECASE,
)
# A place: a "Location:" line or GPS coordinates, a capitalised name followed by Road, Marg,
# Nagar..., "Sector 4"-style areas, "near <Landmark>", or the Hindi words for them. The name
# pattern is case-sensitive on purpose: "road repair" names no road, "Vikas Marg" does.
_PLACE_NAME = re.compile(
    r"\b[A-Z][a-z]+\s+(Road|Marg|Street|Lane|Path|Nagar|Vihar|Enclave|Colony|Chowk|Bagh|Puri|Park|Village|Gali|Market)\b"
    r"|\b(Sector|Block|Pocket|Phase|Ward)\s+[A-Z0-9]|\bnear\s+[A-Z]"
)
_PLACE_LINE = re.compile(r"^\s*(location|address|place)\b|\b\d{1,2}\.\d{3,},\s*\d{2,3}\.\d{3,}\b", re.IGNORECASE | re.MULTILINE)
_PLACE_HINDI = re.compile(r"स्थान|पता|मार्ग|सड़क|रोड|गली|नगर|कॉलोनी|सेक्टर")
_TRANSFER = re.compile(r"6\s*\(\s*3\s*\)|\btransfer|स्थानांतरित|अंतरित", re.IGNORECASE)
_BLANK = re.compile(r"\[[^\]\n]{1,60}\]|_{3,}|\bX{3,}\b|<[^>\n]{1,40}>|\.{5,}")
_COMPLAINT = re.compile(
    r"\bcorrupt\w*|\bbribe\w*|\bscam\w*|\bshame\w*|\bnegligen\w*|\bincompeten\w*|\bharass\w*|\bcheat\w*"
    r"|\byou\s+(have|had)\s+failed\b|\bwhy\s+(have|has|did|do|does)\s+(you|the|pwd)\b",
    re.IGNORECASE,
)
# "Right to Information Act, 2005" or "CPWD Works Manual 2024" name a document, not a period.
_DOCUMENT_YEAR = re.compile(r"(\b(Act|Manual|Rules|अधिनियम|नियम)\b,?\s*)(19|20)\d{2}\b", re.IGNORECASE)
# A line that is only a label and a blank: "Name: [Your name]", "Address: ______".
_BLANK_LINE = re.compile(r"^\s*[\w .()/-]{0,40}:?\s*(\[[^\]\n]{1,60}\]|_{3,}|\.{5,})\s*$")
_NUMBER = re.compile(r"\d+(?:\.\d+)?")
_DURATION = re.compile(r"\b(last|past|previous)\s+\w+\s+(day|week|month|year)s?\b", re.IGNORECASE)
_LOCATION_LINE = re.compile(r"^\s*location[^:\n]*:\s*(.+)$", re.IGNORECASE | re.MULTILINE)


def points_of(text: str) -> list[tuple[int, str]]:
    """The numbered requests in the letter: (its number, its text)."""
    return [(int(match.group(1)), match.group(2).strip()) for line in text.splitlines() if (match := _POINT.match(line))]


def is_hindi(text: str) -> bool:
    letters = [char for char in text if char.isalpha()]
    return bool(letters) and sum(1 for char in letters if _DEVANAGARI.match(char)) / len(letters) > 0.3


def has_place(text: str) -> bool:
    return bool(_PLACE_LINE.search(text) or _PLACE_NAME.search(text) or _PLACE_HINDI.search(text))


def rule_point_issues(text: str) -> dict[int, list[str]]:
    """The excuses the fixed rules find in each numbered point (English only: the patterns are
    English; a Hindi letter is left to the AI)."""
    if is_hindi(text):
        return {}
    found: dict[int, list[str]] = {}
    for number, point in points_of(text):
        request = InformationRequest(
            id=str(number), category="Draft", title=point[:1000], authority="", period="", quality="good"
        )
        codes = [code for code in rule_issues(request) if code in POINT_CHECK]
        if _COMPLAINT.search(point):
            codes.append("COMPLAINT_TONE")
        if codes:
            found[number] = codes
    return found


def document_checks(text: str) -> dict[str, bool]:
    """Pass or fail for the checks that look at the letter as a whole."""
    return {
        "RTI_ACT": bool(_RTI_ACT.search(text)),
        "NUMBERED": bool(points_of(text)),
        "PORTAL_LIMIT": len(text) <= PORTAL_CHAR_LIMIT,
        "PERIOD": bool(_PERIOD.search(_DOCUMENT_YEAR.sub(r"\1", text))),
        "PLACE": has_place(text),
        "TRANSFER": bool(_TRANSFER.search(text)),
        "NO_BLANKS": not _BLANK.search(text),
    }


def _results(text: str, point_issues: dict[int, list[str]]) -> dict[str, bool]:
    passed = document_checks(text)
    failed_by_points = {POINT_CHECK[code] for codes in point_issues.values() for code in codes}
    # Complaint words outside the numbered points count too ("You have failed to repair...").
    if not is_hindi(text) and _COMPLAINT.search(text):
        failed_by_points.add("ASKS_FOR_RECORDS")
    for check_id in ("ASKS_FOR_RECORDS", "SPECIFIC", "NO_PERSONAL_INFO"):
        passed[check_id] = check_id not in failed_by_points
    return passed


def rule_score(text: str) -> tuple[int, dict[str, bool]]:
    passed = _results(text, rule_point_issues(text))
    return sum(passed.values()), passed


# --- the review --------------------------------------------------------------------------------


def review_draft(text: str, *, use_ai: bool) -> DraftReview:
    """The score comes from the fixed rules alone, so the same text always gets the same score,
    and an improved version's score is exactly what the citizen sees after using it. What the
    AI adds about particular points is shown beside the checks, without moving the score."""
    text = text.strip()
    point_issues = rule_point_issues(text)
    passed = _results(text, point_issues)
    score = sum(passed.values())

    ai_notes: list[AiNote] = []
    improved = None
    ai_used = False
    if use_ai:
        try:
            ai_points, improved_text = _ask_model(text, point_issues)
            ai_used = True
            for number in sorted(ai_points):
                for code in ai_points[number]:
                    if code not in point_issues.get(number, []):
                        ai_notes.append(
                            AiNote(point=number, check_id=POINT_CHECK[code], officer_says=_officer_says(code))
                        )
            if improved_text is not None and (score < len(CHECKS) or ai_notes):
                improved = _improved(text, improved_text, passed)
        except Exception:
            logger.warning("AI PIO review failed; using the fixed checks only", exc_info=True)

    return DraftReview(
        score=score,
        out_of=len(CHECKS),
        verdict="ready" if score >= 9 else "fix" if score >= 6 else "weak",
        checks=[_check(check, passed[check.id], point_issues) for check in CHECKS],
        ai_notes=ai_notes,
        improved=improved,
        ai_used=ai_used,
    )


def _officer_says(code: str) -> str:
    return COMPLAINT_SAYS if code == "COMPLAINT_TONE" else EXCUSES[code].officer_says


def _check(check: Check, passed: bool, point_issues: dict[int, list[str]]) -> ReviewCheck:
    notes = []
    if not passed:
        for number in sorted(point_issues):
            for code in point_issues[number]:
                if POINT_CHECK[code] == check.id:
                    notes.append(PointNote(point=number, officer_says=_officer_says(code)))
    return ReviewCheck(
        id=check.id,
        label=check.label,
        passed=passed,
        why=None if passed else check.why,
        section=check.section,
        fix=None if passed else check.fix,
        notes=notes,
    )


def _improved(original: str, rewrite: str, original_passed: dict[str, bool]) -> ImprovedDraft | None:
    """The model's version, if it is safe to offer: see usable_rewrite."""
    if not usable_rewrite(original, rewrite):
        return None
    rewrite = _tidy(rewrite)
    score, passed = rule_score(rewrite)
    # Never worse on anything the fixed rules can see, and better on something.
    if any(original_passed[check_id] and not passed[check_id] for check_id in document_checks(original)):
        return None
    original_rule_score, _ = rule_score(original)
    if score < original_rule_score:
        return None
    fixed = [check_id for check_id in CHECK_IDS if passed[check_id] and not original_passed[check_id]]
    return ImprovedDraft(text=rewrite, score=score, fixed=fixed)


def _tidy(text: str) -> str:
    """Trailing spaces off, and lines that are only a label and a blank ("Name: [Your name]")
    out: the portal asks for name and address in its own fields."""
    lines = [line.rstrip() for line in text.strip().splitlines() if not _BLANK_LINE.match(line)]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def usable_rewrite(original: str, rewrite: object) -> bool:
    """True when the model's version keeps everything that matters in the original:
    every numbered point, every number (no new ones), the location line, the language, and
    adds no period, date or blank of its own."""
    if not isinstance(rewrite, str):
        return False
    rewrite = _tidy(rewrite)
    if len(rewrite) < 40 or " ".join(rewrite.split()) == " ".join(original.split()):
        return False
    if len(rewrite) > PORTAL_CHAR_LIMIT and len(rewrite) >= len(original):
        return False
    if is_hindi(rewrite) != is_hindi(original):
        return False
    original_points, new_points = points_of(original), points_of(rewrite)
    if original_points and len(new_points) != len(original_points):
        return False  # a request dropped, merged or added
    if _BLANK.search(rewrite):
        return False
    # Numbers: only ones already in the letter, the point numbers, and the Act's own.
    allowed = set(_NUMBER.findall(original)) | {str(n) for n in range(1, len(new_points) + 1)} | {"1", "3", "6", "2005"}
    if not set(_NUMBER.findall(rewrite)) <= allowed:
        return False
    if _DURATION.search(rewrite) and not _DURATION.search(original):
        return False  # a period the citizen never gave
    location = _LOCATION_LINE.search(original)
    if location and " ".join(location.group(1).split()).lower() not in " ".join(rewrite.split()).lower():
        return False
    return True


SYSTEM_PROMPT = """You are an experienced, reluctant Public Information Officer (PIO) of the \
Public Works Department, Government of NCT of Delhi. A citizen shows you their RTI \
application BEFORE filing it, so they can make it hard to refuse.

1. For each numbered point, list which of these excuses you could realistically use against it:
{meanings}
Most precise requests for a named record give you no excuse: return an empty list for those. \
Never flag a point just to have something to say. A request to inspect the work or take \
certified samples of material is a valid RTI request (Section 2(j)).

2. If anything in the application can be improved (the problems below, or your excuses), \
write "improved": the whole application again, ready to file, that fixes them. Rules for it:
- Keep every numbered point, in the same order, with the same number of points. You may \
reword a point to ask for a specific existing record, but keep what it asks for.
- Keep the location line, every name, place and number exactly as written.
- Never add a date, period, amount, number or name that is not already in the application, \
and never write a [placeholder] or a blank. If the period or place is missing, leave it out \
rather than invent one.
- If missing, open with "I hereby request information under Section 6(1) of the Right to \
Information Act, 2005." and end with a Section 6(3) transfer line.
- Remove accusations and anything personal, and delete any line with a blank or placeholder \
in it (like "Name: [Your name]"): the portal asks for name and address separately.
- Keep it under 3,000 characters.
- Write in the same language as the application.
Use null for "improved" when nothing needs to change.

Respond with ONLY one JSON object, no prose, no markdown fences:
{{"points": [{{"number": <point number>, "issues": ["<EXCUSE>", ...]}}, ...], "improved": "<text>" | null}}"""

_MEANINGS = {
    "QUESTION_NOT_RECORD": "asks 'why' or for an explanation instead of an existing record",
    "CREATES_NEW_INFO": "asks for an opinion, a judgement, or what will happen in future, which no record holds",
    "COMPLAINT_TONE": "is an accusation or complaint rather than a request for a record",
    "TOO_VAGUE": "does not say which record is wanted, so the officer can reply with something general",
    "TOO_BROAD": "asks for all records, files or works without limit, inviting a 'diverts resources' reply",
    "PERSONAL_INFO": "asks for personal details of an official or contractor (address, phone, tax, bank, medical)",
    "NO_PLACE": "neither the point nor the rest of the application identifies the road or place",
}


def _ask_model(text: str, point_issues: dict[int, list[str]]) -> tuple[dict[int, list[str]], str | None]:
    """The model's excuses per point number, and its improved version (unchecked). Raises on a
    reply that is not the expected shape, so the caller falls back to the rules."""
    results = _results(text, point_issues)
    failed = [check.label for check in CHECKS if not results[check.id]]
    found = "\n".join(f"- point {number}: {', '.join(codes)}" for number, codes in sorted(point_issues.items()))
    user = (
        f"Application:\n<<<\n{text}\n>>>\n\n"
        f"Checks it fails: {'; '.join(failed) if failed else 'none'}\n"
        f"Excuses the fixed rules already found:\n{found or '- none'}"
    )
    meanings = "\n".join(f"- {code}: {meaning}" for code, meaning in _MEANINGS.items())
    payload = llm.complete_json(SYSTEM_PROMPT.format(meanings=meanings), user, max_tokens=6000)
    if not isinstance(payload, dict) or not isinstance(payload.get("points", []), list):
        raise ValueError(f"Expected {{'points': [...], 'improved': ...}}, got: {payload!r}")

    numbers = {number for number, _ in points_of(text)}
    ai: dict[int, list[str]] = {}
    for entry in payload.get("points") or []:
        if not isinstance(entry, dict):
            continue
        try:
            number = int(entry.get("number"))
        except (TypeError, ValueError):
            continue
        if number not in numbers:
            continue  # a point that does not exist
        raw = entry.get("issues")
        codes = [str(code) for code in raw if str(code) in POINT_CHECK] if isinstance(raw, list) else []
        if codes:
            ai[number] = codes[:3]
    improved = payload.get("improved")
    return ai, improved if isinstance(improved, str) else None
