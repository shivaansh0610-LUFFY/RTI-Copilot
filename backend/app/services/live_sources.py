"""Loads the live sources registered in data/live_sources.md (see that file for which pages
were checked and why only one was registered). Unlike data/sources.csv, these pages are never
downloaded ahead of time — app.services.public_info fetches them at request time through
app.services.live_fetch, so this module just reads the small registry telling it which URLs
are safe and useful to fetch.
"""

import csv
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]
CSV_PATH = BACKEND_DIR / "data" / "live_sources.csv"


@dataclass(frozen=True)
class LiveSource:
    title: str
    url: str
    publishes: str
    update_frequency: str
    limits: str
    verified_at: str


def load_live_sources(csv_path: Path = CSV_PATH) -> list[LiveSource]:
    with csv_path.open(newline="", encoding="utf-8") as file:
        return [LiveSource(**row) for row in csv.DictReader(file)]
