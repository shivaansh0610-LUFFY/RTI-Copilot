from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._columns import uuid_pk


class Source(Base):
    """Registry of every official document in the corpus (loaded from data/sources.csv)."""

    __tablename__ = "sources"

    id: Mapped[UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text, unique=True)
    doc_type: Mapped[str] = mapped_column(String(20))  # "act", "rules", "manual", "disclosure", "other"
    authority_level: Mapped[str] = mapped_column(String(20))  # "central", "state" or "department"
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    local_path: Mapped[str] = mapped_column(Text)  # relative to backend/
    checksum: Mapped[str] = mapped_column(String(64))  # SHA-256 hex of the file
