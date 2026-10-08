from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import DateTime, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._columns import timestamp, uuid_pk


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[UUID] = uuid_pk()
    grievance_text: Mapped[str] = mapped_column(Text)
    clarification: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )
    status: Mapped[str] = mapped_column(
        String(40), default="GRIEVANCE_CAPTURED", server_default="GRIEVANCE_CAPTURED"
    )
    created_at: Mapped[datetime] = timestamp()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
