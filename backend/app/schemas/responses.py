from typing import Literal

from pydantic import Field

from app.schemas.base import ApiModel

# Mirrors ClassificationLabel in src/types.ts. Change both together.
ClassificationLabel = Literal[
    "RESPONSIVE",
    "PARTIALLY_RESPONSIVE",
    "NON_RESPONSIVE",
    "NO_RECORD_STATED",
    "EXEMPTION_CLAIMED",
    "TRANSFERRED",
    "FEE_DEMANDED",
    "ATTACHMENT_REFERENCED",
    "INSUFFICIENT_EVIDENCE",
]


class ResponsePassage(ApiModel):
    id: str  # "P-1", "P-2", ... in reading order
    page: int
    paragraph: int
    text: str


class ClassificationResult(ApiModel):
    request_id: str
    label: ClassificationLabel
    explanation: str
    evidence: list[ResponsePassage] = []
    abstention_reason: str | None = None  # set when label is INSUFFICIENT_EVIDENCE


class ResponseAnalysis(ApiModel):
    pages: int
    ocr_used: bool = False  # scans are refused, not read, so this is always False for now
    passages: list[ResponsePassage]
    results: list[ClassificationResult]


class AppealItem(ApiModel):
    request_id: str
    title: str
    label: ClassificationLabel
    explanation: str


class AppealBody(ApiModel):
    items: list[AppealItem] = Field(min_length=1)
    language: Literal["en", "hi"] = "en"


class AppealResponse(ApiModel):
    appeal_text: str
