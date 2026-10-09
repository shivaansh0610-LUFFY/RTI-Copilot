"""Turn a downloaded corpus file into passage-sized paragraphs.

extract_pages() returns the text of each page (a PDF page, or a whole HTML file as one page).
split_paragraphs() cuts one page's text into the paragraphs stored as `passages` rows.

Splitting on blank lines alone is not enough for this corpus: pypdf returns hard-wrapped lines
with no blank lines at all, so each page comes back as one 2,500-4,000 character chunk, while
the embedding model reads only its first 512 tokens (about 2,000 characters) and a whole page
is a blunt thing to cite. So paragraphs are rebuilt in three steps:
  1. cut at blank lines and at lines that open a clause ("(e)", "(iv)", "10.8.1", "6."),
  2. split any piece longer than MAX_CHARS at sentence boundaries,
  3. merge neighbouring pieces until a paragraph would pass TARGET_CHARS.
Paragraphs with no letters in them (a lone page number) are dropped.
"""

import logging
import re
from pathlib import Path

from bs4 import BeautifulSoup
from pypdf import PdfReader
from pypdf.errors import PyPdfError

# pypdf logs one warning for every font it cannot fully decode (hundreds for the CPWD manuals).
# The text still extracts, so keep the console readable.
logging.getLogger("pypdf").setLevel(logging.ERROR)

TARGET_CHARS = 700
MAX_CHARS = 1200  # about 300-400 tokens, comfortably inside the 512 the embedding model reads
MIN_CHARS = 80  # a paragraph shorter than this (a heading, a page number) is merged forward

# A line that starts like this opens a new clause: "(e) ...", "(iv) ...", "10.8.1 ...", "6. ...".
# The cuts only need to be plausible: small pieces are merged back together afterwards.
CLAUSE_START = re.compile(r"\(\w{1,4}\)(?:\s|$)|\d+(?:\.\d+)+(?:\s|$)|\d+\.\s")
SENTENCE_BREAK = re.compile(r"(?<=[.;:?!])\s+")
BLANK_LINE = re.compile(r"\n\s*\n")
# Control characters other than whitespace: NUL (which PostgreSQL text cannot hold) and the
# stray \x01 bullet glyphs some PDFs carry.
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0e-\x1f\x7f]")

# Page chrome on the PWD Delhi site: navigation, footer and the "DDOs" pop-up.
HTML_NOISE = ["script", "style", "noscript", "head", "nav", "header", "footer", "aside", "svg"]
HTML_NOISE_SELECTOR = ".modal"


class ExtractionError(ValueError):
    """A corpus file could not be read."""


def extract_pages(path: Path) -> list[str]:
    """The text of each page: one entry per PDF page, a single entry for an HTML file."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return pdf_pages(path)
    if suffix in (".html", ".htm"):
        return [html_text(path.read_bytes())]
    raise ExtractionError(f"unsupported file type {suffix or '(none)'}: {path.name}")


def pdf_pages(path: Path) -> list[str]:
    try:
        reader = PdfReader(path)
        pages = []
        for number, page in enumerate(reader.pages, start=1):
            try:
                pages.append(page.extract_text() or "")
            except Exception as error:  # pypdf raises many types on damaged pages; say which page
                raise ExtractionError(f"{path.name}: could not read page {number}: {error}") from error
        return pages
    except PyPdfError as error:
        raise ExtractionError(f"{path.name}: not a readable PDF: {error}") from error


def html_text(raw: bytes) -> str:
    """The visible text of a page with its chrome removed. Table rows become one line each."""
    soup = BeautifulSoup(raw, "html.parser")
    for tag in soup(HTML_NOISE):
        tag.decompose()
    for tag in soup.select(HTML_NOISE_SELECTOR):
        tag.decompose()
    for row in soup.find_all("tr"):
        cells = (cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"]))
        row.replace_with("\n\n" + " | ".join(cell for cell in cells if cell) + "\n\n")
    return soup.get_text("\n\n")


def split_paragraphs(page_text: str) -> list[str]:
    """Cut one page into paragraphs of roughly TARGET_CHARS, none longer than MAX_CHARS."""
    pieces = []
    for unit in _units(_strip_unstorable(page_text)):
        pieces.extend(_split_oversized(unit))
    return [paragraph for paragraph in _merge(pieces) if any(char.isalpha() for char in paragraph)]


def _strip_unstorable(text: str) -> str:
    # psycopg cannot encode lone surrogates, which turn up in some PDFs.
    return CONTROL_CHARS.sub(" ", text).encode("utf-8", "ignore").decode("utf-8")


def _units(text: str) -> list[str]:
    units = []
    for block in BLANK_LINE.split(text):
        lines: list[str] = []
        for line in block.splitlines():
            line = line.strip()
            if not line:
                continue
            if lines and CLAUSE_START.match(line):
                units.append(" ".join(lines))
                lines = []
            lines.append(line)
        if lines:
            units.append(" ".join(lines))
    return [cleaned for unit in units if (cleaned := " ".join(unit.split()))]


def _split_oversized(unit: str) -> list[str]:
    if len(unit) <= MAX_CHARS:
        return [unit]
    pieces = []
    for sentence in SENTENCE_BREAK.split(unit):
        while len(sentence) > MAX_CHARS:
            cut = sentence.rfind(" ", 0, MAX_CHARS)
            cut = cut if cut > 0 else MAX_CHARS
            pieces.append(sentence[:cut])
            sentence = sentence[cut:].lstrip()
        if sentence:
            pieces.append(sentence)
    return pieces


def _merge(pieces: list[str]) -> list[str]:
    paragraphs: list[str] = []
    current = ""
    for piece in pieces:
        joined = len(current) + 1 + len(piece)
        if current and joined > TARGET_CHARS and (len(current) >= MIN_CHARS or joined > MAX_CHARS):
            paragraphs.append(current)
            current = piece
        else:
            current = f"{current} {piece}" if current else piece
    if current:
        paragraphs.append(current)
    return paragraphs
