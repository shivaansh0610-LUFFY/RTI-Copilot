"""Turn the registered corpus documents into searchable passages.

Run from backend/, after `alembic upgrade head` and `python -m ingest.register_sources --db`:

    python -m ingest.load_documents            # ingest every source that has no document yet
    python -m ingest.load_documents --force    # delete and re-ingest every source

For each row of the `sources` table this extracts the text of the file at local_path (a PDF via
pypdf, the PWD Delhi page via BeautifulSoup), stores one `documents` row (kind "corpus") and one
`passages` row per paragraph, and fills in each passage's embedding. The embedding model is loaded
once, on first use; the very first run also downloads its weights (about 1.3 GB).

A source is ingested in one transaction, so a document that exists is always complete. That is
what makes reruns safe: a source that already has a document is skipped, and a run that dies
half-way leaves nothing behind for the next run to trip over. The sources row is locked for the
duration, so two loaders started together cannot both ingest the same source.

One failing source never stops the others. The exit code is 1 if any source failed.
"""

import argparse
import sys
from pathlib import Path
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db import get_engine
from app.models import Document, Passage, Source
from app.services import embeddings
from ingest.extract import extract_pages, split_paragraphs
from ingest.register_sources import BACKEND_DIR, Result, resolve_local_path, sha256_of

CORPUS_KIND = "corpus"


def load_all(session: Session, backend_dir: Path, force: bool = False) -> list[Result]:
    """Ingest every row of `sources`. Results are in the same order as the rows."""
    sources = session.execute(select(Source.id, Source.url).order_by(Source.title)).all()
    results = []
    for source_id, url in sources:
        try:
            results.append(ingest_source(session, source_id, backend_dir, force))
        except Exception as error:  # a database or model failure: report it, carry on with the rest
            session.rollback()
            results.append(Result(url, False, f"unexpected error: {error}"))
    return results


def ingest_source(session: Session, source_id: UUID, backend_dir: Path, force: bool = False) -> Result:
    """Ingest one source and commit. A source that cannot be read is rolled back and reported."""
    source = session.get(Source, source_id, with_for_update=True, populate_existing=True)
    url = source.url
    try:
        return _ingest(session, source, backend_dir, force)
    except (ValueError, OSError) as error:  # bad path, missing or altered file, unreadable document
        session.rollback()
        return Result(url, False, str(error))


def _ingest(session: Session, source: Source, backend_dir: Path, force: bool) -> Result:
    existing = list(
        session.scalars(select(Document.id).where(Document.source_id == source.id, Document.kind == CORPUS_KIND))
    )
    if existing and not force:
        count = session.scalar(select(func.count()).select_from(Passage).where(Passage.document_id.in_(existing)))
        session.commit()
        return Result(source.url, True, f"already ingested ({count} passages); use --force to re-ingest")

    path = resolve_local_path(source.local_path, backend_dir)
    if not path.is_file():
        raise ValueError(f"{source.local_path} has not been downloaded; run python -m ingest.register_sources")
    if sha256_of(path) != source.checksum:
        raise ValueError(f"{source.local_path} does not match the registered checksum; nothing was ingested")

    pages = extract_pages(path)
    paragraphs = [
        (page, number, text)
        for page, page_text in enumerate(pages, 1)
        for number, text in enumerate(split_paragraphs(page_text), 1)
    ]
    if not paragraphs:
        raise ValueError(f"{path.name} has no extractable text (a scanned PDF would need OCR, which is not done)")

    print(f"  {path.name}: {len(pages)} pages, {len(paragraphs)} passages; embedding...", flush=True)
    vectors = embeddings.embed_texts([text for _, _, text in paragraphs])

    if existing:  # --force: the old document's passages go with it (ON DELETE CASCADE)
        session.execute(delete(Document).where(Document.id.in_(existing)))
    document = Document(source_id=source.id, kind=CORPUS_KIND, filename=path.name, page_count=len(pages))
    session.add(document)
    session.flush()
    session.add_all(
        Passage(document_id=document.id, page=page, paragraph=number, text=text, embedding=vector)
        for (page, number, text), vector in zip(paragraphs, vectors, strict=True)
    )
    session.commit()
    return Result(source.url, True, f"ingested {len(paragraphs)} passages from {len(pages)} pages")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract, embed and store the registered corpus documents.")
    parser.add_argument("--force", action="store_true", help="delete and re-ingest sources that already have a document")
    args = parser.parse_args(argv)

    try:
        with Session(get_engine(), expire_on_commit=False) as session:
            results = load_all(session, BACKEND_DIR, args.force)
    except Exception as error:  # no database, bad URL, tables not migrated...: report, don't trace
        print(f"ERROR database access failed: {error}", file=sys.stderr)
        return 1

    if not results:
        print("The sources table is empty. Run python -m ingest.register_sources --db first.", file=sys.stderr)
        return 1
    for result in results:
        print(f"{'OK   ' if result.ok else 'ERROR'} {result.url}\n      {result.message}")
    failed = sum(not result.ok for result in results)
    print(f"{len(results) - failed} of {len(results)} sources OK.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
