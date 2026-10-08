"""Column helpers shared by the models.

Each call returns a fresh column, because a mapped_column can only belong to one table.
"""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column


def uuid_pk() -> Mapped[UUID]:
    return mapped_column(Uuid, primary_key=True, default=uuid4)


def timestamp() -> Mapped[datetime]:
    """Timezone-aware, set by the database when the row is inserted."""
    return mapped_column(DateTime(timezone=True), server_default=func.now())
