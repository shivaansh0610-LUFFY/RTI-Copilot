"""Download the official documents listed in data/sources.csv and record their checksums.

Run from backend/:

    python -m ingest.register_sources         # download, checksum, update the CSV
    python -m ingest.register_sources --db    # ...and upsert the rows into the `sources` table

For each CSV row:
  * file missing: download it to local_path. If the row already has a checksum the download
    must match it; otherwise the checksum and fetched_at are recorded in the CSV.
  * file present and the row has a checksum: verify it. A mismatch is an error and nothing
    is overwritten.
  * file present and no checksum: record its checksum (and its modified time as fetched_at).

One failing row never stops the others. The exit code is 1 if any row failed.
"""

import argparse
import csv
import hashlib
import http.cookiejar
import os
import shutil
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

BACKEND_DIR = Path(__file__).resolve().parents[1]
CSV_PATH = BACKEND_DIR / "data" / "sources.csv"
CORPUS_DIR = Path("data") / "corpus"  # relative to backend/

FIELDS = ["title", "url", "doc_type", "authority_level", "fetched_at", "local_path", "checksum"]
DOC_TYPES = {"act", "rules", "manual", "disclosure", "other"}
AUTHORITY_LEVELS = {"central", "state", "department"}
OFFICIAL_SUFFIXES = (".gov.in", ".nic.in")
# Some government sites reject the default Python agent.
USER_AGENT = "Mozilla/5.0 (compatible; RTI-Copilot-ingest/0.1)"
TIMEOUT_SECONDS = 60


class FetchError(Exception):
    """A download failed; the message says why."""


@dataclass
class Result:
    url: str
    ok: bool
    message: str


Fetcher = Callable[[str, Path], None]


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_timestamp(moment: datetime | None = None) -> str:
    return (moment or datetime.now(UTC)).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def is_official_url(url: str) -> bool:
    """Only http(s) URLs on .gov.in or .nic.in hosts are accepted."""
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme in ("http", "https") and host.endswith(OFFICIAL_SUFFIXES)


def read_sources(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open(newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        if reader.fieldnames is None or set(reader.fieldnames) != set(FIELDS):
            raise ValueError(f"{csv_path} must have exactly this header: {','.join(FIELDS)}")
        return [{field: (row.get(field) or "").strip() for field in FIELDS} for row in reader]


def write_sources(csv_path: Path, rows: list[dict[str, str]]) -> None:
    # Write to a temporary file first so a crash cannot leave a half-written CSV.
    with tempfile.NamedTemporaryFile(
        "w", newline="", encoding="utf-8", dir=csv_path.parent, suffix=".tmp", delete=False
    ) as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(file.name, csv_path)


def resolve_local_path(local_path: str, backend_dir: Path) -> Path:
    """local_path is relative to backend/ and must stay inside data/corpus/ (which is gitignored)."""
    corpus_dir = (backend_dir / CORPUS_DIR).resolve()
    path = (backend_dir / local_path).resolve()
    if not path.is_relative_to(corpus_dir) or path == corpus_dir:
        raise ValueError(f"local_path must be a file inside {CORPUS_DIR.as_posix()}/: {local_path}")
    return path


def validate_row(row: dict[str, str]) -> None:
    for field in ("title", "url", "doc_type", "authority_level", "local_path"):
        if not row[field]:
            raise ValueError(f"{field} is empty")
    if row["doc_type"] not in DOC_TYPES:
        raise ValueError(f"doc_type must be one of {sorted(DOC_TYPES)}, not {row['doc_type']!r}")
    if row["authority_level"] not in AUTHORITY_LEVELS:
        raise ValueError(
            f"authority_level must be one of {sorted(AUTHORITY_LEVELS)}, not {row['authority_level']!r}"
        )
    if not is_official_url(row["url"]):
        raise ValueError(f"not an official government URL (http(s) on .gov.in or .nic.in): {row['url']}")
    checksum = row["checksum"]
    if checksum and (len(checksum) != 64 or any(c not in "0123456789abcdef" for c in checksum.lower())):
        raise ValueError(f"checksum is not a SHA-256 hex digest: {checksum!r}")
    if row["fetched_at"]:
        try:
            parse_timestamp(row["fetched_at"])
        except ValueError:
            raise ValueError(f"fetched_at is not an ISO 8601 timestamp: {row['fetched_at']!r}") from None


def download(url: str, dest: Path, timeout: float = TIMEOUT_SECONDS) -> None:
    # Cookies are enabled because some government sites redirect in a loop without them.
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with opener.open(request, timeout=timeout) as response:
            if not is_official_url(response.geturl()):
                raise FetchError(f"redirected to a non-government address: {response.geturl()}")
            with dest.open("wb") as out:
                shutil.copyfileobj(response, out)
    except urllib.error.HTTPError as error:
        raise FetchError(f"HTTP {error.code} {error.reason}") from error
    except urllib.error.URLError as error:
        raise FetchError(f"could not connect: {error.reason}") from error
    except TimeoutError as error:
        raise FetchError(f"timed out after {timeout:g}s") from error


def check_content(path: Path, expected_name: str) -> None:
    """Government sites sometimes answer 200 with an HTML error page instead of the file."""
    if expected_name.lower().endswith(".pdf"):
        with path.open("rb") as file:
            if b"%PDF-" not in file.read(1024):
                raise ValueError("the server sent something that is not a PDF (an error page?)")


def process_row(
    row: dict[str, str],
    backend_dir: Path = BACKEND_DIR,
    fetch: Fetcher = download,
    now: Callable[[], str] = utc_timestamp,
) -> Result:
    """Download/verify one row. On success, fills in row['checksum'] and row['fetched_at']."""
    try:
        validate_row(row)
        path = resolve_local_path(row["local_path"], backend_dir)
        if path.exists():
            return register_existing_file(row, path)
        return download_new_file(row, path, fetch, now)
    except (FetchError, ValueError, OSError) as error:
        return Result(row["url"], False, str(error) or type(error).__name__)


def register_existing_file(row: dict[str, str], path: Path) -> Result:
    recorded = row["checksum"].lower()
    actual = sha256_of(path)
    if recorded and actual != recorded:
        return Result(
            row["url"],
            False,
            f"CHECKSUM MISMATCH for {row['local_path']}: sources.csv has {recorded}, "
            f"the file on disk is {actual}. Nothing was overwritten.",
        )
    if recorded:
        return Result(row["url"], True, f"verified {row['local_path']}")
    row["checksum"] = actual
    row["fetched_at"] = row["fetched_at"] or utc_timestamp(datetime.fromtimestamp(path.stat().st_mtime, UTC))
    return Result(row["url"], True, f"registered existing file {row['local_path']}")


def download_new_file(row: dict[str, str], path: Path, fetch: Fetcher, now: Callable[[], str]) -> Result:
    recorded = row["checksum"].lower()
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f"{path.name}.part")
    try:
        fetch(row["url"], partial)
        check_content(partial, path.name)
        actual = sha256_of(partial)
        if recorded and actual != recorded:
            return Result(
                row["url"],
                False,
                f"CHECKSUM MISMATCH: the download has {actual} but sources.csv has {recorded}. "
                "The document may have changed upstream; the download was discarded.",
            )
        os.replace(partial, path)
    finally:
        partial.unlink(missing_ok=True)

    if not recorded:
        row["checksum"] = actual
        row["fetched_at"] = now()
    return Result(row["url"], True, f"downloaded {row['local_path']} ({path.stat().st_size:,} bytes)")


def register_all(
    rows: list[dict[str, str]],
    backend_dir: Path = BACKEND_DIR,
    fetch: Fetcher = download,
    now: Callable[[], str] = utc_timestamp,
) -> list[Result]:
    """Process every row. A failure in one row is reported and never stops the others."""
    results = []
    seen: set[str] = set()
    for row in rows:
        url = row["url"]
        try:
            if url in seen:
                raise ValueError("duplicate url in sources.csv")
            seen.add(url)
            results.append(process_row(row, backend_dir, fetch, now))
        except Exception as error:  # deliberately broad: one bad row must not stop the rest
            detail = str(error) or type(error).__name__
            results.append(Result(url, False, detail))
    return results


def build_upsert(row: dict[str, str]) -> Any:
    """INSERT ... ON CONFLICT (url) DO UPDATE for one row of the `sources` table."""
    from sqlalchemy.dialects.postgresql import insert

    from app.models import Source

    statement = insert(Source).values(
        id=uuid4(),
        title=row["title"],
        url=row["url"],
        doc_type=row["doc_type"],
        authority_level=row["authority_level"],
        fetched_at=parse_timestamp(row["fetched_at"]),
        local_path=row["local_path"],
        checksum=row["checksum"],
    )
    updatable = ("title", "doc_type", "authority_level", "fetched_at", "local_path", "checksum")
    return statement.on_conflict_do_update(
        index_elements=[Source.url], set_={name: statement.excluded[name] for name in updatable}
    )


def sync_to_database(rows: list[dict[str, str]]) -> int:
    """Insert or update each row in the `sources` table, matched on url. Returns the row count."""
    from sqlalchemy.orm import Session

    from app.db import get_engine

    with Session(get_engine()) as session, session.begin():
        for row in rows:
            session.execute(build_upsert(row))
    return len(rows)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download and checksum the official source documents.")
    parser.add_argument("--csv", type=Path, default=CSV_PATH, help="registry file (default: data/sources.csv)")
    parser.add_argument("--db", action="store_true", help="also insert/update the rows in the sources table")
    args = parser.parse_args(argv)

    rows = read_sources(args.csv)
    original = [dict(row) for row in rows]
    results = register_all(rows, BACKEND_DIR, download, utc_timestamp)
    if rows != original:
        write_sources(args.csv, rows)

    for result in results:
        print(f"{'OK   ' if result.ok else 'ERROR'} {result.url}\n      {result.message}")
    failed = sum(not result.ok for result in results)
    print(f"{len(results) - failed} of {len(results)} sources OK.")

    if args.db:
        good_rows = [row for row, result in zip(rows, results, strict=True) if result.ok]
        try:
            count = sync_to_database(good_rows)
        except Exception as error:  # no database, bad URL, missing extension...: report, don't trace
            print(f"ERROR database sync failed: {error}", file=sys.stderr)
            return 1
        print(f"Synced {count} rows to the sources table.")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
