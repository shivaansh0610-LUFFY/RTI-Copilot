from typing import Literal

from pydantic import Field

from app.schemas.base import ApiModel
from app.schemas.requests import InformationRequest


class ClarifyQuestion(ApiModel):
    key: str
    question: str
    options: list[str]


class ClarifyResult(ApiModel):
    # Extracted straight from the grievance, no need to ask (e.g. the grievance already
    # states "since 2 months", so answers={"period": "Last 2 months"} with no period question).
    answers: dict[str, str] = {}
    # Only what's genuinely still missing. Can be empty if the grievance said everything needed.
    questions: list[ClarifyQuestion] = []


class DecomposeBody(ApiModel):
    clarification: dict[str, str] = {}


class RequestsBody(ApiModel):
    requests: list[InformationRequest]


class DraftBody(ApiModel):
    # An application with nothing in it is not a draft.
    requests: list[InformationRequest] = Field(min_length=1)
    language: Literal["en", "hi"] = "en"


class DraftResponse(ApiModel):
    draft_text: str
    char_count: int
    over_limit: bool
    warning: str | None = None
    flagged_request_ids: list[str] = []
