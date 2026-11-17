from fastapi import APIRouter

from app.config import get_settings
from app.schemas.review import DraftReview, ReviewBody
from app.services import pio_review

router = APIRouter(tags=["review"])


@router.post("/review-draft", response_model=DraftReview, response_model_exclude_none=True)
def review_draft(body: ReviewBody) -> DraftReview:
    """PIO review of a whole application: the wizard's draft, or one pasted in. Needs no case
    and stores nothing."""
    return pio_review.review_draft(body.draft_text, use_ai=get_settings().use_llm_drafting)
