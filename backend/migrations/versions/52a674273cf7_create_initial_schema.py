"""create initial schema

Revision ID: 52a674273cf7
Revises:
Create Date: 2026-10-08

Written by hand: autogenerate needs a live database. It has not been run against a real
PostgreSQL yet. Needs PostgreSQL 16 with the pgvector extension available.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "52a674273cf7"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "cases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("grievance_text", sa.Text(), nullable=False),
        sa.Column(
            "clarification", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("status", sa.String(length=40), server_default="GRIEVANCE_CAPTURED", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("case_id", sa.Uuid(), nullable=False),
        sa.Column("rq_id", sa.String(length=40), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("authority", sa.Text(), nullable=False),
        sa.Column("period", sa.String(length=80), nullable=False),
        sa.Column("quality", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=True),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("public_status", sa.String(length=20), nullable=True),
        sa.Column("public_source_title", sa.Text(), nullable=True),
        sa.Column("public_source_url", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("case_id", "rq_id", name="uq_requests_case_id_rq_id"),
        sa.CheckConstraint("quality IN ('good', 'needs-detail')", name="ck_requests_quality"),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_requests_case_id", "requests", ["case_id"])

    op.create_table(
        "sources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("doc_type", sa.String(length=20), nullable=False),
        sa.Column("authority_level", sa.String(length=20), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("local_path", sa.Text(), nullable=False),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("url"),
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("case_id", sa.Uuid(), nullable=True),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("ocr_used", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["case_id"], ["cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["sources.id"]),
    )

    op.create_table(
        "passages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("document_id", sa.Uuid(), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("paragraph", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1024), nullable=True),
        sa.Column(
            "tsv",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('english', text)", persisted=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "page", "paragraph", name="uq_passages_document_id_page_paragraph"),
        sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_passages_document_id", "passages", ["document_id"])
    op.create_index("ix_passages_tsv", "passages", ["tsv"], postgresql_using="gin")
    # No vector index on passages.embedding yet: add HNSW/IVFFlat in a later migration, once
    # there is data to build it on.


def downgrade() -> None:
    op.drop_index("ix_passages_tsv", table_name="passages")
    op.drop_index("ix_passages_document_id", table_name="passages")
    op.drop_table("passages")
    op.drop_table("documents")
    op.drop_table("sources")
    op.drop_index("ix_requests_case_id", table_name="requests")
    op.drop_table("requests")
    op.drop_table("cases")
    # The vector extension is left installed: it may be shared, and creating it was
    # "IF NOT EXISTS", so this migration cannot tell whether it owns it.
