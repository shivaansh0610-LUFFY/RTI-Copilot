from typing import Literal

from app.schemas.base import ApiModel

# Mirrors src/types.ts. Change both together.


class PublicSource(ApiModel):
    title: str
    url: str


class InformationRequest(ApiModel):
    id: str  # e.g. "RQ-001"
    category: str  # e.g. "Work order"
    title: str
    authority: str
    period: str
    quality: Literal["good", "needs-detail"]
    source: Literal["generated", "custom", "follow-up"] | None = None
    context: str | None = None  # why this is being asked, e.g. what an earlier reply left out
    publicly_available: bool | None = None
    public_source: PublicSource | None = None  # where it was found, when publicly_available
