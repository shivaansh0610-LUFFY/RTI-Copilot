"""Importing this package registers every table on app.db.Base.metadata."""

from app.models.cases import Case
from app.models.requests import CaseRequest

__all__ = ["Case", "CaseRequest"]
