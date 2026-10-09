"""Helpers shared by the ingestion and retrieval tests (not a test module).

* fake embeddings, so no test ever loads the 1.3 GB model;
* a minimal PDF writer, so the PDF path is exercised without committing a binary fixture;
* database sessions: an in-memory SQLite stand-in that always works, and real PostgreSQL + pgvector
  when TEST_DATABASE_URL points at a server. The PostgreSQL tests run in a scratch schema that is
  dropped afterwards, so they never touch tables of the same name in the database they connect to.
"""

import hashlib
import math
import os
import re
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from pgvector.sqlalchemy import Vector
from sqlalchemy import create_engine, event, text
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from app.db import Base
from app.models import Document, Passage, Source
from app.services.embeddings import EMBEDDING_DIMENSIONS

# --- fake embeddings --------------------------------------------------------------------------


def fake_embed(text_: str) -> list[float]:
    """A deterministic unit vector built from the words in the text: texts that share words get
    similar vectors, which is all a ranking test needs from an embedding."""
    vector = [0.0] * EMBEDDING_DIMENSIONS
    for word in re.findall(r"[a-z0-9]+", text_.lower()):
        vector[int(hashlib.md5(word.encode()).hexdigest(), 16) % EMBEDDING_DIMENSIONS] += 1.0
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def fake_embed_texts(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    return [fake_embed(item) for item in texts]


def use_fake_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import embeddings

    monkeypatch.setattr(embeddings, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(embeddings, "embed_query", fake_embed)


def forbid_real_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail loudly, rather than download 1.3 GB, if a test reaches the real model."""
    from app.services import embeddings

    def refuse():
        raise AssertionError("a test tried to load the real embedding model")

    monkeypatch.setattr(embeddings, "_load_model", refuse)


def clause(label: str, length: int) -> str:
    """Text of exactly `length` characters that opens like a legal clause: "(a) word word ..."."""
    text = f"({label}) " + "word " * length
    return text[:length].rstrip().ljust(length, "x")


# --- a minimal PDF ----------------------------------------------------------------------------


def make_pdf(pages: list[list[str]]) -> bytes:
    """A valid PDF with one page per item; each page shows its list of lines of text."""
    page_ids = [4 + 2 * index for index in range(len(pages))]
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    for page_id, lines in zip(page_ids, pages, strict=True):
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {page_id + 1} 0 R "
            f"/Resources << /Font << /F1 3 0 R >> >> >>".encode()
        )
        operations = ["BT", "/F1 11 Tf", "14 TL", "50 740 Td"]
        for line in lines:
            escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            operations.append(f"({escaped}) Tj T*")
        operations.append("ET")
        stream = "\n".join(operations).encode("latin-1")
        objects.append(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))

    body = b"%PDF-1.4\n"
    offsets = []
    for number, content in enumerate(objects, start=1):
        offsets.append(len(body))
        body += b"%d 0 obj\n%s\nendobj\n" % (number, content)
    table = b"0000000000 65535 f \n" + b"".join(b"%010d 00000 n \n" % offset for offset in offsets)
    return (
        body
        + b"xref\n0 %d\n%s" % (len(objects) + 1, table)
        + b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, len(body))
    )


# --- database sessions ------------------------------------------------------------------------


@compiles(Vector, "sqlite")
def _vector_as_text(type_, compiler, **kw):
    return "TEXT"


@compiles(TSVECTOR, "sqlite")
def _tsvector_as_text(type_, compiler, **kw):
    return "TEXT"


@contextmanager
def sqlite_session() -> Iterator[Session]:
    """The corpus tables on in-memory SQLite. `tsv` is just the text and `embedding` a string, so
    this checks the Python logic and the ORM operations, not PostgreSQL's search."""
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def _prepare(connection, _record):
        connection.execute("PRAGMA foreign_keys = ON")
        # `passages.tsv` is a generated column calling a PostgreSQL function.
        connection.create_function("to_tsvector", 2, lambda config, value: value, deterministic=True)

    tables = [Source.__table__, Document.__table__, Passage.__table__]
    Base.metadata.create_all(engine, tables=tables)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE cases (id CHAR(32) PRIMARY KEY)"))  # target of documents.case_id
    try:
        with Session(engine) as session:
            yield session
    finally:
        engine.dispose()


@contextmanager
def postgres_session() -> Iterator[Session]:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("set TEST_DATABASE_URL (PostgreSQL 16 with pgvector) to run this against a real database")
    schema = f"test_{uuid4().hex[:12]}"
    admin = create_engine(url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    # Every statement is rewritten to use the scratch schema. (A search path is not enough:
    # create_all skips tables it can see in `public`, and the tests would then write into them.)
    engine = create_engine(url).execution_options(schema_translate_map={None: schema})
    Base.metadata.create_all(engine)
    with admin.connect() as connection:
        created = connection.scalar(
            text("SELECT count(*) FROM information_schema.tables WHERE table_schema = :schema"), {"schema": schema}
        )
    assert created == len(Base.metadata.tables), "the test tables were not created in the scratch schema"
    try:
        with Session(engine) as session:
            yield session
    finally:
        engine.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@contextmanager
def database_session(kind: str) -> Iterator[Session]:
    with (sqlite_session() if kind == "sqlite" else postgres_session()) as session:
        yield session


# --- registry rows ----------------------------------------------------------------------------


def add_source(session: Session, backend_dir: Path, filename: str, content: bytes, **fields) -> Source:
    """Write `content` to <backend_dir>/data/corpus/<filename> and register it in `sources`."""
    path = backend_dir / "data" / "corpus" / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    source = Source(
        title=fields.get("title", filename),
        url=fields.get("url", f"https://example.gov.in/{filename}"),
        doc_type=fields.get("doc_type", "act"),
        authority_level=fields.get("authority_level", "central"),
        fetched_at=datetime.now(UTC),
        local_path=fields.get("local_path", f"data/corpus/{filename}"),
        checksum=fields.get("checksum", hashlib.sha256(content).hexdigest()),
    )
    session.add(source)
    session.commit()
    return source
