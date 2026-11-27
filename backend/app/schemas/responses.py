from typing import Literal

from pydantic import Field

from app.schemas.base import ApiModel
from app.schemas.requests import InformationRequest

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


class CorpusCitation(ApiModel):
    """A passage of the official corpus (the RTI Act, Rules, or CPWD Works Manual) that checks a
    finding against the actual rule, e.g. whether a claimed exemption or fee is a real one."""

    id: str
    text: str
    page: int
    source_title: str
    url: str


class ClassificationResult(ApiModel):
    request_id: str
    label: ClassificationLabel
    explanation: str
    evidence: list[ResponsePassage] = []
    abstention_reason: str | None = None  # set when label is INSUFFICIENT_EVIDENCE
    # Corpus passages that check the finding against the actual rule -- only set for labels where
    # the PIO is making a claim worth checking (see response_analysis.GROUNDING_QUERIES).
    grounding: list[CorpusCitation] = []


class ResponseAnalysis(ApiModel):
    pages: int
    ocr_used: bool = False  # true when at least one page had no selectable text and was OCR'd
    passages: list[ResponsePassage]
    results: list[ClassificationResult]
    # The reply in simple words, from the same AI call; absent when the model gave none.
    summary: str | None = None
    # Only for a reply to an RTI not drafted here: the requests the results are for (the
    # citizen's pasted questions, or the points read from the reply itself).
    requests: list[InformationRequest] | None = None


class AppealItem(ApiModel):
    request_id: str = Field(max_length=40)
    title: str = Field(max_length=1000)
    label: ClassificationLabel
    explanation: str = Field(max_length=2000)


class AppealBody(ApiModel):
    items: list[AppealItem] = Field(min_length=1, max_length=20)
    language: Literal["en", "hi"] = "en"


class AppealResponse(ApiModel):
    appeal_text: str
