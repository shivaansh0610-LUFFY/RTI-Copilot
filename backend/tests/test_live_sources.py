import csv
from pathlib import Path

from ingest.register_sources import is_official_url, parse_timestamp

LIVE_SOURCES_CSV = Path(__file__).resolve().parents[1] / "data" / "live_sources.csv"
FIELDS = ["title", "url", "publishes", "update_frequency", "limits", "verified_at"]


def read_live_sources() -> list[dict[str, str]]:
    with LIVE_SOURCES_CSV.open(newline="", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        assert reader.fieldnames == FIELDS
        return list(reader)


def test_live_sources_has_the_expected_header_and_at_least_one_row():
    assert read_live_sources()


def test_every_live_source_is_an_official_government_url():
    for row in read_live_sources():
        assert is_official_url(row["url"]), row["url"]


def test_live_sources_have_no_duplicate_urls():
    urls = [row["url"] for row in read_live_sources()]

    assert len(urls) == len(set(urls))


def test_every_live_source_says_what_it_publishes_how_often_and_what_it_cannot_do():
    for row in read_live_sources():
        for field in FIELDS:
            assert row[field].strip(), f"{row['url']}: {field} is empty"
        parse_timestamp(row["verified_at"])  # raises on anything but an ISO 8601 timestamp


# --- app.services.live_sources: loading the CSV into the type public_info.py uses -------------

from app.services.live_sources import load_live_sources  # noqa: E402


def test_load_live_sources_returns_one_entry_per_row():
    sources = load_live_sources()

    assert len(sources) == len(read_live_sources())
    assert sources[0].url == read_live_sources()[0]["url"]


def test_load_live_sources_reads_a_given_csv_path(tmp_path):
    csv_path = tmp_path / "live_sources.csv"
    csv_path.write_text(
        "title,url,publishes,update_frequency,limits,verified_at\n"
        'Example,https://example.gov.in/x,"Example table",Daily,"None",2026-01-01T00:00:00Z\n',
        encoding="utf-8",
    )

    sources = load_live_sources(csv_path)

    assert len(sources) == 1
    assert sources[0].title == "Example"
    assert sources[0].url == "https://example.gov.in/x"
