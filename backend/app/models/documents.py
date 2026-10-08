from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._columns import timestamp, uuid_pk


class Document(Base):
    """A file whose text gets extracted: a corpus document or an uploaded RTI reply."""

    __tablename__ = "documents"

    id: Mapped[UUID] = uuid_pk()
    # Null for corpus documents, which belong to no case.
    case_id: Mapped[UUID | None] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"))
    # Set for corpus documents.
    source_id: Mapped[UUID | None] = mapped_column(ForeignKey("sources.id"))
    kind: Mapped[str] = mapped_column(String(20))  # "corpus" or "response"
    filename: Mapped[str] = mapped_column(Text)
    page_count: Mapped[int | None] = mapped_column(Integer)
    ocr_used: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = timestamp()
