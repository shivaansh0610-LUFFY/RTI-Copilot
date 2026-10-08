from uuid import UUID

import pytest
from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR

import app.models as models
from app.db import Base

# column -> (type, nullable). Straight from the schema brief.
EXPECTED: dict[str, dict[str, tuple[type, bool]]] = {
    "cases": {
        "id": (Uuid, False),
        "grievance_text": (Text, False),
        "clarification": (JSONB, False),
        "status": (String, False),
        "created_at": (DateTime, False),
        "updated_at": (DateTime, False),
    },
    "requests": {
        "id": (Uuid, False),
        "case_id": (Uuid, False),
        "rq_id": (String, False),
        "category": (String, False),
        "title": (Text, False),
        "authority": (Text, False),
        "period": (String, False),
        "quality": (String, False),
        "source": (String, True),
        "context": (Text, True),
        "public_status": (String, True),
        "public_source_title": (Text, True),
        "public_source_url": (Text, True),
    },
    "sources": {
        "id": (Uuid, False),
        "title": (Text, False),
        "url": (Text, False),
        "doc_type": (String, False),
        "authority_level": (String, False),
        "fetched_at": (DateTime, False),
        "local_path": (Text, False),
        "checksum": (String, False),
    },
    "documents": {
        "id": (Uuid, False),
        "case_id": (Uuid, True),
        "source_id": (Uuid, True),
        "kind": (String, False),
        "filename": (Text, False),
        "page_count": (Integer, True),
        "ocr_used": (Boolean, False),
        "created_at": (DateTime, False),
    },
    "passages": {
        "id": (Uuid, False),
        "document_id": (Uuid, False),
        "page": (Integer, False),
        "paragraph": (Integer, False),
        "text": (Text, False),
        "embedding": (Vector, True),
        "tsv": (TSVECTOR, False),
    },
}

STRING_LENGTHS = {
    ("cases", "status"): 40,
    ("requests", "rq_id"): 40,
    ("requests", "category"): 80,
    ("requests", "period"): 80,
    ("requests", "quality"): 20,
    ("requests", "source"): 20,
    ("requests", "public_status"): 20,
    ("sources", "doc_type"): 20,
    ("sources", "authority_level"): 20,
    ("sources", "checksum"): 64,
    ("documents", "kind"): 20,
}


def table(name: str) -> Table:
    return Base.metadata.tables[name]


def unique_column_sets(name: str) -> set[frozenset[str]]:
    return {
        frozenset(c.name for c in constraint.columns)
        for constraint in table(name).constraints
        if isinstance(constraint, UniqueConstraint)
    }


def foreign_keys(name: str) -> dict[str, tuple[str, str | None]]:
    """column -> (referenced column, ON DELETE rule)."""
    return {
        fk.parent.name: (fk.target_fullname, fk.ondelete)
        for fk in table(name).foreign_keys
    }


def test_metadata_has_exactly_the_five_tables() -> None:
    assert set(Base.metadata.tables) == {"cases", "requests", "sources", "documents", "passages"}


@pytest.mark.parametrize("name", EXPECTED)
def test_table_has_exactly_the_listed_columns(name: str) -> None:
    assert [c.name for c in table(name).columns] == list(EXPECTED[name])


@pytest.mark.parametrize("name", EXPECTED)
def test_column_types_and_nullability(name: str) -> None:
    for column in table(name).columns:
        expected_type, nullable = EXPECTED[name][column.name]
        assert isinstance(column.type, expected_type), f"{name}.{column.name}"
        assert column.nullable is nullable, f"{name}.{column.name}"


def test_string_lengths() -> None:
    for (name, column), length in STRING_LENGTHS.items():
        assert table(name).c[column].type.length == length, f"{name}.{column}"


def test_every_id_is_a_uuid_primary_key_generated_in_python() -> None:
    for name in EXPECTED:
        id_column = table(name).c.id
        assert id_column.primary_key
        assert isinstance(id_column.default.arg(None), UUID), name


def test_all_models_inherit_from_the_shared_base_and_are_exported() -> None:
    exported = [getattr(models, n) for n in models.__all__]
    assert len(exported) == 5
    assert all(issubclass(model, Base) for model in exported)
    assert {model.__tablename__ for model in exported} == set(EXPECTED)


def test_timestamps_are_timezone_aware_with_a_server_default() -> None:
    for name, column in [
        ("cases", "created_at"),
        ("cases", "updated_at"),
        ("documents", "created_at"),
    ]:
        col = table(name).c[column]
        assert col.type.timezone is True, f"{name}.{column}"
        assert "now()" in str(col.server_default.arg), f"{name}.{column}"
    assert table("sources").c.fetched_at.type.timezone is True
    assert table("sources").c.fetched_at.server_default is None  # the registry supplies it


def test_updated_at_also_changes_on_update() -> None:
    assert table("cases").c.updated_at.onupdate is not None
    assert table("cases").c.created_at.onupdate is None


def test_case_defaults() -> None:
    cases = table("cases")
    assert cases.c.clarification.default.arg(None) == {}
    assert str(cases.c.clarification.server_default.arg) == "'{}'::jsonb"
    assert cases.c.status.default.arg == "GRIEVANCE_CAPTURED"
    assert str(cases.c.status.server_default.arg) == "GRIEVANCE_CAPTURED"


def test_ocr_used_defaults_to_false() -> None:
    column = table("documents").c.ocr_used
    assert column.default.arg is False
    assert "false" in str(column.server_default.arg).lower()


def test_foreign_keys_and_cascades() -> None:
    assert foreign_keys("requests") == {"case_id": ("cases.id", "CASCADE")}
    assert foreign_keys("documents") == {
        "case_id": ("cases.id", "CASCADE"),
        "source_id": ("sources.id", None),
    }
    assert foreign_keys("passages") == {"document_id": ("documents.id", "CASCADE")}
    assert foreign_keys("cases") == {}
    assert foreign_keys("sources") == {}


def test_unique_constraints() -> None:
    assert frozenset({"case_id", "rq_id"}) in unique_column_sets("requests")
    assert frozenset({"document_id", "page", "paragraph"}) in unique_column_sets("passages")
    assert table("sources").c.url.unique


def test_requests_quality_is_check_constrained() -> None:
    checks = [c for c in table("requests").constraints if isinstance(c, CheckConstraint)]
    assert len(checks) == 1
    assert checks[0].name == "ck_requests_quality"
    sql = str(checks[0].sqltext)
    assert "'good'" in sql and "'needs-detail'" in sql


def test_foreign_keys_that_the_brief_calls_indexed_are_indexed() -> None:
    def indexed_columns(name: str) -> set[tuple[str, ...]]:
        return {tuple(c.name for c in index.columns) for index in table(name).indexes}

    assert ("case_id",) in indexed_columns("requests")
    assert ("document_id",) in indexed_columns("passages")


def test_embedding_is_1024_dimensions_with_no_vector_index() -> None:
    passages = table("passages")
    assert passages.c.embedding.type.dim == 1024
    for index in passages.indexes:
        assert "embedding" not in {c.name for c in index.columns}


def test_tsv_is_a_stored_generated_column() -> None:
    tsv = table("passages").c.tsv
    assert isinstance(tsv.computed, Computed)
    assert tsv.computed.persisted is True
    assert str(tsv.computed.sqltext) == "to_tsvector('english', text)"


def test_tsv_has_a_gin_index() -> None:
    gin = [i for i in table("passages").indexes if [c.name for c in i.columns] == ["tsv"]]
    assert len(gin) == 1
    assert gin[0].dialect_options["postgresql"]["using"] == "gin"
