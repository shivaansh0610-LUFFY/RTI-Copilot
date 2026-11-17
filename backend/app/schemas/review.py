from typing import Literal

from pydantic import Field

from app.schemas.base import ApiModel

# Mirrors DraftReview in src/types.ts. Change both together.


class ReviewBody(ApiModel):
    draft_text: str = Field(min_length=1, max_length=12000)


class PointNote(ApiModel):
    point: int  # the numbered request it is about
    officer_says: str


class ReviewCheck(ApiModel):
    id: str  # a key of app.services.pio_review.CHECKS
    label: str
    passed: bool
    why: str | None = None  # only when it failed
    section: str | None = None  # the provision behind it, when there is one
    fix: str | None = None  # only when it failed
    notes: list[PointNote] = []  # what the officer could say about particular points


class AiNote(ApiModel):
    """Something the AI, playing the officer, noticed about one point. Not part of the score."""

    point: int
    check_id: str  # the check it belongs with
    officer_says: str


class ImprovedDraft(ApiModel):
    text: str
    score: int  # its own score on the fixed checks
    fixed: list[str]  # ids of the checks it passes that the original failed


class DraftReview(ApiModel):
    score: int  # fixed checks passed: the same text always gets the same score
    out_of: int
    verdict: Literal["ready", "fix", "weak"]
    checks: list[ReviewCheck]  # from the fixed rules only: the score
    ai_notes: list[AiNote] = []
    improved: ImprovedDraft | None = None  # only when it passed every safety check
    ai_used: bool
