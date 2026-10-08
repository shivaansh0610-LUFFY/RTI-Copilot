"""Tests for ingest.register_sources. No network access: downloads are faked."""

import hashlib
import io
import os
import urllib.error
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy.dialects import postgresql

from ingest import register_sources as rs

PDF_BYTES = b"%PDF-1.4\nnot a real document, just enough to pass the sniff test\n"
PDF_SHA = hashlib.sha256(PDF_BYTES).hexdigest()
FIXED_NOW = "2026-10-08T10:00:00Z"
URL = "https://example.gov.in/docs/act.pdf"


def make_row(**overrides: str) -> dict[str, str]:
    row = {
        "title": "Test Act, 2005",
        "url": URL,
        "doc_type": "act",
        "authority_level": "central",
        "fetched_at": "",
        "local_path": "data/corpus/act.pdf",
        "checksum": "",
    }
    return {**row, **overrides}


def fake_fetch(content: bytes = PDF_BYTES):
    calls: list[str] = []

    def fetch(url: str, dest: Path) -> None:
        calls.append(url)
        dest.write_bytes(content)

    fetch.calls = calls  # type: ignore[attr-defined]
    return fetch


def process(row, backend_dir: Path, fetch=None):
    return rs.process_row(row, backend_dir, fetch or fake_fetch(), lambda: FIXED_NOW)


def leftovers(backend_dir: Path) -> list[str]:
    corpus = backend_dir / "data" / "corpus"
    return sorted(p.name for p in corpus.glob("*")) if corpus.exists() else []


# --- checksum -----------------------------------------------------------------------------


def test_sha256_of_known_input(tmp_path: Path) -> None:
    file = tmp_path / "abc.txt"
    file.write_bytes(b"abc")
    assert rs.sha256_of(file) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_sha256_of_file_larger_than_one_chunk(tmp_path: Path) -> None:
    content = os.urandom(2 * 1024 * 1024 + 123)
    file = tmp_path / "big.bin"
    file.write_bytes(content)
    assert rs.sha256_of(file) == hashlib.sha256(content).hexdigest()


# --- CSV ------------------------------------------------------------------------------------


def test_csv_round_trip_keeps_commas_and_quotes(tmp_path: Path) -> None:
    csv_path = tmp_path / "sources.csv"
    rows = [make_row(title='The "RTI" Act, 2005 (as amended, 2019)', checksum=PDF_SHA, fetched_at=FIXED_NOW)]
    rs.write_sources(csv_path, rows)
    assert csv_path.read_text().splitlines()[0] == "title,url,doc_type,authority_level,fetched_at,local_path,checksum"
    assert rs.read_sources(csv_path) == rows
    assert list(tmp_path.iterdir()) == [csv_path]  # no temp file left behind


def test_read_sources_treats_missing_values_as_empty(tmp_path: Path) -> None:
    csv_path = tmp_path / "sources.csv"
    csv_path.write_text(f"{','.join(rs.FIELDS)}\nTitle,{URL},act,central\n")
    row = rs.read_sources(csv_path)[0]
    assert row["checksum"] == "" and row["fetched_at"] == ""


def test_read_sources_rejects_a_wrong_header(tmp_path: Path) -> None:
    csv_path = tmp_path / "sources.csv"
    csv_path.write_text("title,url\nx,y\n")
    with pytest.raises(ValueError, match="exactly this header"):
        rs.read_sources(csv_path)


# --- URL / path / row validation -----------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "https://cic.gov.in/sites/default/files/RTI_English.pdf",
        "http://delhigovt.nic.in/rti/",
        "https://INDIACODE.NIC.IN/x.pdf",
    ],
)
def test_official_urls_are_accepted(url: str) -> None:
    assert rs.is_official_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://pwddelhi.s3.ap-south-1.amazonaws.com/documents/urban-roads-manual.pdf",
        "https://gov.in.evil.example/x.pdf",
        "https://evilgov.in/x.pdf",
        "https://example.gov.in@evil.example/x.pdf",
        "https://example.com/?next=https://x.gov.in/",
        "file:///etc/passwd",
        "ftp://files.gov.in/x.pdf",
        "not a url",
        "",
    ],
)
def test_other_urls_are_rejected(url: str) -> None:
    assert not rs.is_official_url(url)


@pytest.mark.parametrize(
    "local_path", ["../escape.pdf", "/etc/passwd", "data/other/x.pdf", "data/corpus", "data/corpus/../x.pdf"]
)
def test_local_path_must_stay_inside_the_corpus_folder(tmp_path: Path, local_path: str) -> None:
    with pytest.raises(ValueError, match="inside data/corpus"):
        rs.resolve_local_path(local_path, tmp_path)


def test_local_path_inside_the_corpus_folder_is_accepted(tmp_path: Path) -> None:
    assert rs.resolve_local_path("data/corpus/a/b.pdf", tmp_path) == (tmp_path / "data/corpus/a/b.pdf").resolve()


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"doc_type": "blog"}, "doc_type"),
        ({"authority_level": "federal"}, "authority_level"),
        ({"url": "https://example.com/x.pdf"}, "official government URL"),
        ({"title": ""}, "title is empty"),
        ({"checksum": "abc123"}, "SHA-256"),
        ({"fetched_at": "last tuesday"}, "ISO 8601"),
    ],
)
def test_invalid_rows_are_rejected(tmp_path: Path, overrides: dict[str, str], message: str) -> None:
    fetch = fake_fetch()
    results = rs.register_all([make_row(**overrides)], tmp_path, fetch, lambda: FIXED_NOW)
    assert not results[0].ok and message in results[0].message
    assert fetch.calls == []


# --- process_row ----------------------------------------------------------------------------


def test_missing_file_is_downloaded_and_registered(tmp_path: Path) -> None:
    row = make_row()
    fetch = fake_fetch()
    result = process(row, tmp_path, fetch)
    assert result.ok
    assert fetch.calls == [URL]
    assert (tmp_path / "data/corpus/act.pdf").read_bytes() == PDF_BYTES
    assert row["checksum"] == PDF_SHA
    assert row["fetched_at"] == FIXED_NOW
    assert leftovers(tmp_path) == ["act.pdf"]


def test_existing_file_with_matching_checksum_is_verified_not_downloaded(tmp_path: Path) -> None:
    (tmp_path / "data/corpus").mkdir(parents=True)
    (tmp_path / "data/corpus/act.pdf").write_bytes(PDF_BYTES)
    row = make_row(checksum=PDF_SHA, fetched_at="2026-01-01T00:00:00Z")
    before = dict(row)
    fetch = fake_fetch()
    result = process(row, tmp_path, fetch)
    assert result.ok and "verified" in result.message
    assert fetch.calls == []
    assert row == before


def test_checksum_comparison_ignores_case(tmp_path: Path) -> None:
    (tmp_path / "data/corpus").mkdir(parents=True)
    (tmp_path / "data/corpus/act.pdf").write_bytes(PDF_BYTES)
    assert process(make_row(checksum=PDF_SHA.upper(), fetched_at=FIXED_NOW), tmp_path).ok


def test_checksum_mismatch_is_an_error_and_overwrites_nothing(tmp_path: Path) -> None:
    corpus = tmp_path / "data/corpus"
    corpus.mkdir(parents=True)
    (corpus / "act.pdf").write_bytes(PDF_BYTES + b"tampered")
    row = make_row(checksum=PDF_SHA, fetched_at="2026-01-01T00:00:00Z")
    before = dict(row)
    fetch = fake_fetch(b"%PDF-1.4 a different download")
    result = process(row, tmp_path, fetch)
    assert not result.ok and "CHECKSUM MISMATCH" in result.message
    assert (corpus / "act.pdf").read_bytes() == PDF_BYTES + b"tampered"
    assert fetch.calls == []
    assert row == before


def test_existing_file_without_a_checksum_gets_registered(tmp_path: Path) -> None:
    corpus = tmp_path / "data/corpus"
    corpus.mkdir(parents=True)
    file = corpus / "act.pdf"
    file.write_bytes(PDF_BYTES)
    modified = datetime(2026, 3, 4, 5, 6, 7, tzinfo=UTC).timestamp()
    os.utime(file, (modified, modified))
    row = make_row()
    fetch = fake_fetch()
    result = process(row, tmp_path, fetch)
    assert result.ok and fetch.calls == []
    assert row["checksum"] == PDF_SHA
    assert row["fetched_at"] == "2026-03-04T05:06:07Z"


def test_recorded_checksum_is_enforced_on_a_fresh_download(tmp_path: Path) -> None:
    # The usual fresh-clone case: the CSV is committed, the corpus folder is empty.
    row = make_row(checksum=PDF_SHA, fetched_at="2026-01-01T00:00:00Z")
    result = process(row, tmp_path)
    assert result.ok and "downloaded" in result.message
    assert row["fetched_at"] == "2026-01-01T00:00:00Z"  # the original fetch date is kept
    assert leftovers(tmp_path) == ["act.pdf"]


def test_fresh_download_that_differs_from_the_recorded_checksum_is_discarded(tmp_path: Path) -> None:
    row = make_row(checksum=PDF_SHA, fetched_at="2026-01-01T00:00:00Z")
    before = dict(row)
    result = process(row, tmp_path, fake_fetch(b"%PDF-1.4 the upstream file changed"))
    assert not result.ok and "CHECKSUM MISMATCH" in result.message
    assert leftovers(tmp_path) == []
    assert row == before


def test_an_html_error_page_is_not_accepted_as_a_pdf(tmp_path: Path) -> None:
    row = make_row()
    result = process(row, tmp_path, fake_fetch(b"<html><body>Service unavailable</body></html>"))
    assert not result.ok and "not a PDF" in result.message
    assert leftovers(tmp_path) == []
    assert row["checksum"] == ""


def test_a_failed_download_leaves_no_partial_file(tmp_path: Path) -> None:
    def failing_fetch(url: str, dest: Path) -> None:
        dest.write_bytes(b"%PDF-1.4 half a fi")
        raise rs.FetchError("connection reset")

    row = make_row()
    results = rs.register_all([row], tmp_path, failing_fetch, lambda: FIXED_NOW)
    assert not results[0].ok and "connection reset" in results[0].message
    assert leftovers(tmp_path) == []
    assert row["checksum"] == ""


# --- register_all / main --------------------------------------------------------------------


def test_one_failure_does_not_stop_the_other_rows(tmp_path: Path) -> None:
    bad = make_row(url="https://down.gov.in/a.pdf", local_path="data/corpus/a.pdf")
    good = make_row(url="https://up.gov.in/b.pdf", local_path="data/corpus/b.pdf")

    def fetch(url: str, dest: Path) -> None:
        if "down" in url:
            raise rs.FetchError("HTTP 503 Service Unavailable")
        dest.write_bytes(PDF_BYTES)

    results = rs.register_all([bad, good], tmp_path, fetch, lambda: FIXED_NOW)
    assert [r.ok for r in results] == [False, True]
    assert "HTTP 503" in results[0].message
    assert bad["checksum"] == "" and good["checksum"] == PDF_SHA


def test_an_unexpected_exception_is_reported_per_row(tmp_path: Path) -> None:
    def fetch(url: str, dest: Path) -> None:
        raise RuntimeError

    results = rs.register_all([make_row()], tmp_path, fetch, lambda: FIXED_NOW)
    assert not results[0].ok and results[0].message == "RuntimeError"


def test_duplicate_urls_are_an_error(tmp_path: Path) -> None:
    first, second = make_row(), make_row(local_path="data/corpus/other.pdf")
    results = rs.register_all([first, second], tmp_path, fake_fetch(), lambda: FIXED_NOW)
    assert [r.ok for r in results] == [True, False]
    assert "duplicate" in results[1].message


def test_main_updates_the_csv_and_returns_zero(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rs, "BACKEND_DIR", tmp_path)
    monkeypatch.setattr(rs, "download", lambda url, dest: dest.write_bytes(PDF_BYTES))
    csv_path = tmp_path / "sources.csv"
    rs.write_sources(csv_path, [make_row()])
    assert rs.main(["--csv", str(csv_path)]) == 0
    row = rs.read_sources(csv_path)[0]
    assert row["checksum"] == PDF_SHA
    assert row["fetched_at"].endswith("Z")
    # Second run: nothing to download, nothing to change, still success.
    monkeypatch.setattr(rs, "download", lambda url, dest: pytest.fail("should not download again"))
    assert rs.main(["--csv", str(csv_path)]) == 0
    assert rs.read_sources(csv_path)[0] == row


def test_main_returns_one_when_any_row_fails_but_still_records_the_others(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def download(url: str, dest: Path) -> None:
        if "down" in url:
            raise rs.FetchError("HTTP 503 Service Unavailable")
        dest.write_bytes(PDF_BYTES)

    monkeypatch.setattr(rs, "BACKEND_DIR", tmp_path)
    monkeypatch.setattr(rs, "download", download)
    csv_path = tmp_path / "sources.csv"
    rs.write_sources(
        csv_path,
        [
            make_row(url="https://down.gov.in/a.pdf", local_path="data/corpus/a.pdf"),
            make_row(url="https://up.gov.in/b.pdf", local_path="data/corpus/b.pdf"),
        ],
    )
    assert rs.main(["--csv", str(csv_path)]) == 1
    down, up = rs.read_sources(csv_path)
    assert down["checksum"] == "" and up["checksum"] == PDF_SHA
    output = capsys.readouterr().out
    assert "ERROR https://down.gov.in/a.pdf" in output and "HTTP 503" in output
    assert "1 of 2 sources OK" in output


# --- download() with a faked opener (still no network) ---------------------------------------


class FakeResponse(io.BytesIO):
    def __init__(self, content: bytes, final_url: str) -> None:
        super().__init__(content)
        self._final_url = final_url

    def geturl(self) -> str:
        return self._final_url


def fake_opener(monkeypatch: pytest.MonkeyPatch, outcome) -> None:
    class Opener:
        def open(self, request, timeout):
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

    monkeypatch.setattr(rs.urllib.request, "build_opener", lambda *handlers: Opener())


def test_download_writes_the_response_body(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fake_opener(monkeypatch, FakeResponse(PDF_BYTES, URL))
    rs.download(URL, tmp_path / "out.pdf")
    assert (tmp_path / "out.pdf").read_bytes() == PDF_BYTES


def test_download_refuses_a_redirect_to_a_non_government_host(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_opener(monkeypatch, FakeResponse(PDF_BYTES, "https://mirror.example.com/act.pdf"))
    with pytest.raises(rs.FetchError, match="non-government"):
        rs.download(URL, tmp_path / "out.pdf")
    assert not (tmp_path / "out.pdf").exists()


@pytest.mark.parametrize(
    ("error", "message"),
    [
        (urllib.error.HTTPError(URL, 404, "Not Found", None, None), "HTTP 404 Not Found"),
        (urllib.error.URLError("name resolution failed"), "could not connect: name resolution failed"),
        (TimeoutError(), "timed out after 60s"),
    ],
)
def test_download_failures_become_clear_fetch_errors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, error: Exception, message: str
) -> None:
    fake_opener(monkeypatch, error)
    with pytest.raises(rs.FetchError, match=message):
        rs.download(URL, tmp_path / "out.pdf")


# --- database upsert (compiled only: it has not been run against PostgreSQL) -----------------


def test_database_upsert_is_keyed_on_url_and_leaves_the_id_alone() -> None:
    sql = str(rs.build_upsert(make_row(checksum=PDF_SHA, fetched_at=FIXED_NOW)).compile(dialect=postgresql.dialect()))
    assert "INSERT INTO sources" in sql
    assert "ON CONFLICT (url) DO UPDATE" in sql
    update_clause = sql.split("DO UPDATE SET", 1)[1]
    for column in ("title", "doc_type", "authority_level", "fetched_at", "local_path", "checksum"):
        assert f"{column} = excluded.{column}" in update_clause
    assert "id = " not in update_clause and "url = " not in update_clause
