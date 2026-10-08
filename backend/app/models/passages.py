from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import Computed, ForeignKey, Index, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._columns import uuid_pk

EMBEDDING_DIMENSIONS = 1024


class Passage(Base):
    """One paragraph of text extracted from a document."""

    __tablename__ = "passages"
    __table_args__ = (
        UniqueConstraint("document_id", "page", "paragraph", name="uq_passages_document_id_page_paragraph"),
        # Declared here too so `alembic revision --autogenerate` does not propose dropping it.
        Index("ix_passages_tsv", "tsv", postgresql_using="gin"),
    )

    id: Mapped[UUID] = uuid_pk()
    document_id: Mapped[UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    page: Mapped[int] = mapped_column(Integer)
    paragraph: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    # Filled in by a later job; there is no vector index on it yet.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    # Full-text search vector, maintained by Postgres. Never set it from Python.
    tsv: Mapped[str] = mapped_column(TSVECTOR, Computed("to_tsvector('english', text)", persisted=True))
