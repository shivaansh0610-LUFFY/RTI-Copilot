from uuid import UUID

from pydantic import Field

from app.schemas.base import ApiModel


class CaseCreate(ApiModel):
    grievance_text: str = Field(min_length=10)


class CaseCreated(ApiModel):
    case_id: UUID
