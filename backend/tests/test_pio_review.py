import pytest

from app.services import pio_review

GOOD = """I hereby request information under Section 6(1) of the Right to Information Act, 2005.
Location concerned: Vikas Marg, near Laxmi Nagar Metro Station, Delhi (28.63100, 77.27700)
1. Certified copy of the work order issued for the repair of the road at the above location for the last six months.
2. Copies of the entries in the Measurement Book for the repair work at the above location.
3. Certified copy of the quality control inspection report for the repair work at the above location.
If any of the requested information is held by another public authority, please transfer this application to it under Section 6(3) of the Act."""

BAD = """To the PIO, PWD
Why have you not repaired the road near my house? This is pure negligence.
1. Why was the road not repaired?
2. When will PWD repair it?
3. All records of all roads in Delhi
4. Home address and phone number of the contractor
Name: [Your name]"""

MID = """I want information about the road.
Location concerned: Vikas Marg, near Laxmi Nagar Metro Station, Delhi
1. Why was the road near Laxmi Nagar Metro Station not repaired properly?
2. Copy of the work order for the repair of Vikas Marg
3. Mobile number of the junior engineer"""


def failed(review) -> list[str]:
    return [check.id for check in review.checks if not check.passed]


# --- the fixed checks --------------------------------------------------------------------------


def test_a_good_application_scores_full_marks():
    review = pio_review.review_draft(GOOD, use_ai=False)

    assert (review.score, review.out_of, review.verdict) == (10, 10, "ready")
    assert failed(review) == []
    assert review.improved is None and review.ai_used is False


def test_a_bad_application_fails_with_a_reason_and_a_fix_for_each_check():
    review = pio_review.review_draft(BAD, use_ai=False)

    assert review.verdict == "weak"
    assert set(failed(review)) == {
        "RTI_ACT", "PERIOD", "PLACE", "TRANSFER", "NO_BLANKS", "ASKS_FOR_RECORDS", "SPECIFIC", "NO_PERSONAL_INFO"
    }
    assert review.score == 2
    for check in review.checks:
        if not check.passed:
            assert check.why and check.fix
        else:
            assert check.why is None and check.fix is None


def test_point_problems_say_which_point_and_what_the_officer_could_reply():
    review = pio_review.review_draft(BAD, use_ai=False)
    notes = {check.id: [(n.point, n.officer_says) for n in check.notes] for check in review.checks}

    assert [point for point, _ in notes["ASKS_FOR_RECORDS"]] == [1, 2]
    assert "not answers to 'why' questions" in notes["ASKS_FOR_RECORDS"][0][1]
    assert [point for point, _ in notes["SPECIFIC"]] == [2, 3]
    assert [point for point, _ in notes["NO_PERSONAL_INFO"]] == [4]


@pytest.mark.parametrize(
    ("text", "check", "passes"),
    [
        ("Under the RTI Act please give 1. Copy of the work order", "RTI_ACT", True),
        ("Please give 1. Copy of the work order", "RTI_ACT", False),
        ("x" * 3001, "PORTAL_LIMIT", False),
        ("x" * 3000, "PORTAL_LIMIT", True),
        ("1. Copy of the work order for the last one year", "PERIOD", True),
        ("1. Copy of the work order dated 2025", "PERIOD", True),
        # The Act's own year, or a manual's, is not a period.
        ("Under the Right to Information Act, 2005: 1. Copy of the work order", "PERIOD", False),
        ("1. Copy of the work order as in the CPWD Works Manual 2024", "PERIOD", False),
        ("1. Copy of the work order for Vikas Marg", "PLACE", True),
        ("Location: somewhere\n1. Copy of the work order", "PLACE", True),
        ("1. Copy of the work order for the road repair", "PLACE", False),
        ("1. Copy of the work order for the road near Laxmi Nagar", "PLACE", True),
        ("1. Copy of the work order. Please transfer under Section 6(3) if needed.", "TRANSFER", True),
        ("1. Copy of the work order", "TRANSFER", False),
        ("1. Copy of the work order\nName: ____", "NO_BLANKS", False),
        ("1. Copy of the work order\nAddress: [address]", "NO_BLANKS", False),
        ("1. Copy of the work order (Annexure V)", "NO_BLANKS", True),
        ("1. Copy of the work order. You have failed to repair it, this is corruption.", "ASKS_FOR_RECORDS", False),
        ("Please give the records.", "NUMBERED", False),
        ("1) Copy of the work order", "NUMBERED", True),
    ],
)
def test_each_check(text, check, passes):
    review = pio_review.review_draft(text, use_ai=False)

    assert {c.id: c.passed for c in review.checks}[check] is passes


def test_a_hindi_application_is_checked_on_its_own_words():
    hindi = (
        "मैं सूचना का अधिकार अधिनियम, 2005 की धारा 6(1) के अंतर्गत निम्नलिखित सूचना चाहता हूँ।\n"
        "स्थान: विकास मार्ग, लक्ष्मी नगर, दिल्ली\n"
        "1. पिछले एक वर्ष में सड़क की मरम्मत के कार्य आदेश की प्रमाणित प्रति।\n"
        "यदि सूचना किसी अन्य लोक प्राधिकरण के पास है, तो आवेदन धारा 6(3) के अंतर्गत अंतरित करें।"
    )

    review = pio_review.review_draft(hindi, use_ai=False)

    assert failed(review) == []


def test_the_score_counts_passed_checks():
    review = pio_review.review_draft(MID, use_ai=False)

    assert review.score == sum(check.passed for check in review.checks)
    assert review.verdict == ("ready" if review.score >= 9 else "fix" if review.score >= 6 else "weak")


# --- the AI --------------------------------------------------------------------------------------


def fake_model(monkeypatch, payload):
    calls = []

    def complete_json(system, user, **kwargs):
        calls.append(user)
        if isinstance(payload, Exception):
            raise payload
        return payload

    monkeypatch.setattr(pio_review.llm, "complete_json", complete_json)
    return calls


IMPROVED_MID = """I hereby request information under Section 6(1) of the Right to Information Act, 2005.
Location concerned: Vikas Marg, near Laxmi Nagar Metro Station, Delhi
1. Copy of the inspection reports for the road near Laxmi Nagar Metro Station.
2. Copy of the work order for the repair of Vikas Marg.
3. Name and designation of the junior engineer in charge of this work.
If any of the requested information is held by another public authority, please transfer this application under Section 6(3) of the Act."""


def test_the_ai_can_note_point_problems_only_from_the_fixed_list_and_never_moves_the_score(monkeypatch):
    fake_model(
        monkeypatch,
        {
            "points": [
                {"number": 2, "issues": ["TOO_VAGUE", "MADE_UP_CODE"]},
                {"number": 99, "issues": ["TOO_BROAD"]},  # no such point
                {"number": "x", "issues": ["TOO_BROAD"]},
            ],
            "improved": None,
        },
    )

    review = pio_review.review_draft(MID, use_ai=True)
    rules_only = pio_review.review_draft(MID, use_ai=False)

    assert review.ai_used is True
    assert [(note.point, note.check_id) for note in review.ai_notes] == [(2, "SPECIFIC")]
    assert "does not make clear which records" in review.ai_notes[0].officer_says
    assert review.score == rules_only.score
    assert [c.passed for c in review.checks] == [c.passed for c in rules_only.checks]


def test_an_ai_note_the_rules_already_made_is_not_repeated(monkeypatch):
    fake_model(monkeypatch, {"points": [{"number": 1, "issues": ["QUESTION_NOT_RECORD"]}], "improved": None})

    review = pio_review.review_draft(MID, use_ai=True)

    assert review.ai_notes == []


def test_the_improved_score_is_the_score_it_gets_when_checked_again(monkeypatch):
    fake_model(monkeypatch, {"points": [], "improved": IMPROVED_MID})
    review = pio_review.review_draft(MID, use_ai=True)

    fake_model(monkeypatch, {"points": [{"number": 1, "issues": ["TOO_VAGUE"]}], "improved": None})
    again = pio_review.review_draft(review.improved.text, use_ai=True)

    assert again.score == review.improved.score


def test_a_safe_improved_version_is_offered_with_what_it_fixes(monkeypatch):
    calls = fake_model(monkeypatch, {"points": [], "improved": IMPROVED_MID})

    review = pio_review.review_draft(MID, use_ai=True)

    assert review.improved is not None
    assert review.improved.text == IMPROVED_MID
    assert review.improved.score > review.score
    assert {"RTI_ACT", "TRANSFER", "ASKS_FOR_RECORDS", "NO_PERSONAL_INFO"} <= set(review.improved.fixed)
    assert "PERIOD" not in review.improved.fixed  # the citizen has to give the period; it is never invented
    assert "Checks it fails:" in calls[0]


def test_a_label_and_blank_line_is_removed_from_the_improved_version(monkeypatch):
    fake_model(monkeypatch, {"points": [], "improved": IMPROVED_MID + "\nName: [Your name]"})

    review = pio_review.review_draft(MID, use_ai=True)

    assert review.improved is not None and "[Your name]" not in review.improved.text


@pytest.mark.parametrize(
    "rewrite",
    [
        IMPROVED_MID.replace("3. Name and designation of the junior engineer in charge of this work.\n", ""),  # a point dropped
        IMPROVED_MID.replace("Copy of the work order", "Copy of the work order no. 4521"),  # a new number
        IMPROVED_MID.replace("for the road near", "for the last six months for the road near"),  # a new period
        IMPROVED_MID.replace("Vikas Marg, near Laxmi Nagar Metro Station, Delhi", "Vikas Marg, Delhi"),  # location changed
        IMPROVED_MID.replace("in charge of this work", "in charge of [work name]"),  # a blank inside a point
        "मैं सूचना का अधिकार अधिनियम के अंतर्गत सूचना चाहता हूँ। 1. प्रति 2. प्रति 3. प्रति स्थान: विकास मार्ग",  # language changed
        MID,  # unchanged
        "Too short",
        None,
        12345,
    ],
)
def test_an_unsafe_improved_version_is_never_offered(monkeypatch, rewrite):
    fake_model(monkeypatch, {"points": [], "improved": rewrite})

    review = pio_review.review_draft(MID, use_ai=True)

    assert review.improved is None


def test_an_improved_version_that_loses_a_passed_check_is_not_offered(monkeypatch):
    # The original's Section 6(3) line is gone: worse on a check it passed.
    original = GOOD.replace("1. Certified copy", "1. Why was the road not repaired? Certified copy")
    worse = original.replace("1. Why was the road not repaired? Certified copy", "1. Certified copy").rsplit("\n", 1)[0]
    fake_model(monkeypatch, {"points": [], "improved": worse})

    review = pio_review.review_draft(original, use_ai=True)

    assert review.improved is None


def test_a_perfect_application_gets_no_rewrite_even_if_the_model_offers_one(monkeypatch):
    fake_model(monkeypatch, {"points": [], "improved": GOOD.replace("please transfer", "kindly transfer")})

    review = pio_review.review_draft(GOOD, use_ai=True)

    assert review.score == 10 and review.improved is None


@pytest.mark.parametrize("payload", [RuntimeError("429 rate limit"), ["not", "an", "object"], {"points": "nope"}])
def test_when_the_ai_fails_the_fixed_checks_still_run(monkeypatch, payload):
    fake_model(monkeypatch, payload)

    review = pio_review.review_draft(BAD, use_ai=True)

    assert review.ai_used is False
    assert review.score == 2 and review.improved is None


def test_the_ai_is_not_called_when_it_is_off(monkeypatch):
    calls = fake_model(monkeypatch, {"points": [], "improved": None})

    pio_review.review_draft(BAD, use_ai=False)

    assert calls == []


# --- the endpoint ----------------------------------------------------------------------------------


def test_the_endpoint_reviews_pasted_text_without_a_case(client):
    response = client.post("/review-draft", json={"draftText": BAD})

    assert response.status_code == 200
    body = response.json()
    assert (body["score"], body["outOf"], body["verdict"], body["aiUsed"]) == (2, 10, "weak", False)
    assert "improved" not in body
    first_failed = next(check for check in body["checks"] if not check["passed"])
    assert {"id", "label", "why", "fix"} <= first_failed.keys()


@pytest.mark.parametrize("text", ["", "x" * 12001])
def test_the_endpoint_refuses_empty_or_huge_text(client, text):
    assert client.post("/review-draft", json={"draftText": text}).status_code == 422
