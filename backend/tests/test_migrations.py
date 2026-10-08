"""Checks the hand-written migration without a database, using Alembic's offline mode."""

import re
from io import StringIO
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

import app.models  # noqa: F401
from app.db import Base

BACKEND_DIR = Path(__file__).resolve().parents[1]
TABLES = ["cases", "requests", "sources", "documents", "passages"]


@pytest.fixture
def alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    # alembic.ini uses a path relative to backend/; pytest may run from elsewhere.
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.output_buffer = StringIO()
    return config


@pytest.fixture
def upgrade_sql(alembic_config: Config) -> str:
    command.upgrade(alembic_config, "head", sql=True)
    return alembic_config.output_buffer.getvalue()


@pytest.fixture
def downgrade_sql(alembic_config: Config) -> str:
    command.downgrade(alembic_config, "head:base", sql=True)
    return alembic_config.output_buffer.getvalue()


def create_table_bodies(sql: str) -> dict[str, set[str]]:
    """table name -> the set of normalised lines inside its CREATE TABLE (...)."""
    bodies = {}
    for name, body in re.findall(r"CREATE TABLE (\w+) \((.*?)\n\)", sql, flags=re.DOTALL):
        lines = (line.strip().rstrip(",").strip() for line in body.splitlines())
        bodies[name] = {line for line in lines if line}
    return bodies


def create_index_statements(sql: str) -> set[str]:
    return {" ".join(s.split()) for s in re.findall(r"CREATE INDEX [^;]+", sql)}


def test_there_is_a_single_migration_head(alembic_config: Config) -> None:
    assert len(ScriptDirectory.from_config(alembic_config).get_heads()) == 1


def test_upgrade_creates_the_extension_then_the_five_tables(upgrade_sql: str) -> None:
    extension = upgrade_sql.index("CREATE EXTENSION IF NOT EXISTS vector")
    positions = [upgrade_sql.index(f"CREATE TABLE {name} (") for name in TABLES]
    assert extension < min(positions)
    # Parents before the tables that reference them.
    assert positions == sorted(positions)
    assert len(re.findall(r"CREATE TABLE (?!alembic_version)", upgrade_sql)) == 5


def test_upgrade_adds_the_gin_index_on_tsv(upgrade_sql: str) -> None:
    assert re.search(r"CREATE INDEX ix_passages_tsv ON passages USING gin \(tsv\)", upgrade_sql)


def test_upgrade_adds_no_vector_index_yet(upgrade_sql: str) -> None:
    lowered = upgrade_sql.lower()
    assert "hnsw" not in lowered
    assert "ivfflat" not in lowered
    assert "vector_cosine_ops" not in lowered


def test_upgrade_uses_a_generated_tsv_column_and_a_1024_dim_vector(upgrade_sql: str) -> None:
    assert "tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', text)) STORED" in upgrade_sql
    assert "embedding VECTOR(1024)" in upgrade_sql


def test_downgrade_drops_everything_it_created(downgrade_sql: str) -> None:
    for name in TABLES:
        assert f"DROP TABLE {name};" in downgrade_sql
    assert "DROP INDEX ix_passages_tsv;" in downgrade_sql
    # Children are dropped before the tables they reference.
    drops = [downgrade_sql.index(f"DROP TABLE {name};") for name in ["passages", "documents", "sources", "requests", "cases"]]
    assert drops == sorted(drops)


def test_migration_matches_the_models(upgrade_sql: str) -> None:
    """Guards against editing a model without writing a migration (or vice versa)."""
    migration_tables = create_table_bodies(upgrade_sql)
    dialect = postgresql.dialect()
    for table in Base.metadata.sorted_tables:
        model_sql = str(CreateTable(table).compile(dialect=dialect))
        model_body = create_table_bodies(f"CREATE TABLE {table.name} ({model_sql.split('(', 1)[1]}")[table.name]
        assert migration_tables[table.name] == model_body, table.name

    model_indexes = {
        " ".join(str(CreateIndex(index).compile(dialect=dialect)).split())
        for table in Base.metadata.tables.values()
        for index in table.indexes
    }
    assert create_index_statements(upgrade_sql) == model_indexes
