"""Importing this package registers every table on app.db.Base.metadata."""

from app.models.cases import Case
from app.models.documents import Document
from app.models.passages import Passage
from app.models.requests import CaseRequest
from app.models.sources import Source

__all__ = ["Case", "CaseRequest", "Document", "Passage", "Source"]
