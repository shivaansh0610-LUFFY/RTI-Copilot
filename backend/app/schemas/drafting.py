from app.schemas.base import ApiModel
from app.schemas.requests import InformationRequest


class DecomposeBody(ApiModel):
    clarification: dict[str, str] = {}


class RequestsBody(ApiModel):
    requests: list[InformationRequest]


class DraftResponse(ApiModel):
    draft_text: str
