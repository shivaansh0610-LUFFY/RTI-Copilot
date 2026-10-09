from app.schemas.base import ApiModel
from app.schemas.requests import InformationRequest


class DecomposeBody(ApiModel):
    clarification: dict[str, str] = {}


class RequestsBody(ApiModel):
    requests: list[InformationRequest]


class DraftResponse(ApiModel):
    draft_text: str
    char_count: int
    over_limit: bool
    warning: str | None = None
    flagged_request_ids: list[str] = []
