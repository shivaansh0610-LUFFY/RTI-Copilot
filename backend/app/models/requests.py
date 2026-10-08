from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models._columns import uuid_pk


class CaseRequest(Base):
    """One information request in a case. Mirrors InformationRequest in src/types.ts.

    Named CaseRequest, not InformationRequest, so it does not clash with the API schema
    of that name in app/schemas.
    """

    __tablename__ = "requests"
    __table_args__ = (
        UniqueConstraint("case_id", "rq_id", name="uq_requests_case_id_rq_id"),
        CheckConstraint("quality IN ('good', 'needs-detail')", name="ck_requests_quality"),
    )

    id: Mapped[UUID] = uuid_pk()
    case_id: Mapped[UUID] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    rq_id: Mapped[str] = mapped_column(String(40))  # e.g. "RQ-001", "FU-RQ-002"
    category: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(Text)
    authority: Mapped[str] = mapped_column(Text)
    period: Mapped[str] = mapped_column(String(80))
    quality: Mapped[str] = mapped_column(String(20))  # "good" or "needs-detail"
    source: Mapped[str | None] = mapped_column(String(20))  # "generated", "custom" or "follow-up"
    context: Mapped[str | None] = mapped_column(Text)
    # "already_public" or "not_found"; None means the public-availability check has not run.
    public_status: Mapped[str | None] = mapped_column(String(20))
    public_source_title: Mapped[str | None] = mapped_column(Text)
    public_source_url: Mapped[str | None] = mapped_column(Text)
