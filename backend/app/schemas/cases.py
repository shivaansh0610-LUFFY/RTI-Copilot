from uuid import UUID

from pydantic import Field

from app.schemas.base import ApiModel


class CaseCreate(ApiModel):
    # 5,000 characters is far more than any grievance needs, and bounds what reaches the model.
    grievance_text: str = Field(min_length=10, max_length=5000)


class CaseCreated(ApiModel):
    case_id: UUID
