"""Fetch one official web page or PDF right now and return its text.

The corpus in data/sources.csv is downloaded ahead of time, checksummed and stored as passages.
This module is the opposite: nothing is stored or cached, so each call asks the official site
again and the text is as fresh as the site itself makes it. It only fetches and extracts text.
What the text means (whether a grievance is "found" in it) is for the caller to decide.

fetch_live_text() either returns real text or raises LiveFetchError; it never returns a partial
or empty result. It raises for:
  * a URL that is not http(s) on .gov.in or .nic.in (the rule register_sources.py applies), and
    a redirect that would leave those domains, which is refused before the other host is asked;
  * a timeout, a refused connection, a non-200 answer, or a body that is cut short or too big;
  * something that is neither a PDF nor HTML;
  * a page with no text in it (a scanned PDF, or a page whose content is filled in by JavaScript).

It runs inside a citizen's request, so it is blocking and short: TIMEOUT_SECONDS bounds each wait
on the network and the whole download. The deadline is checked between reads and redirects, so
one stalled read can run past it by up to another TIMEOUT_SECONDS; DNS lookups and parsing are
not covered (MAX_BYTES keeps parsing small).

A page whose text is filled in by JavaScript (several PWD Delhi pages are) comes back as its
empty shell: headings and column names, no data. Only a page with no letters at all is rejected.
"""

import http.client
import http.cookiejar
import io
import time
import urllib.error
import urllib.request
from typing import IO

from ingest.extract import BLANK_LINE, html_text, pdf_pages
from ingest.register_sources import is_official_url

TIMEOUT_SECONDS = 5.0
MAX_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 4
READ_CHUNK_BYTES = 64 * 1024
# Some government sites reject the default Python agent.
USER_AGENT = "Mozilla/5.0 (compatible; RTI-Copilot-live/0.1)"
HTML_TYPES = {"text/html", "application/xhtml+xml"}


class LiveFetchError(Exception):
    """A live fetch failed; `url` is the page asked for and `reason` says why."""

    def __init__(self, url: str, reason: str) -> None:
        super().__init__(f"{url}: {reason}")
        self.url = url
        self.reason = reason


class NotOfficialUrlError(LiveFetchError):
    """The URL, or a redirect from it, is not http(s) on .gov.in or .nic.in."""


class FetchTimeoutError(LiveFetchError):
    """The official site did not answer in time."""


class EmptyPageError(LiveFetchError):
    """The page was fetched but holds no text to read."""


def fetch_live_text(url: str) -> str:
    """The text of the page or PDF at `url`, fetched now. Table rows come back one per line."""
    if not is_official_url(url):
        raise NotOfficialUrlError(url, "not an official government URL (http(s) on .gov.in or .nic.in)")
    body, content_type = _download(url)
    text = _extract(url, body, content_type)
    if not any(char.isalpha() for char in text):
        raise EmptyPageError(url, "the page has no text to read (a scanned PDF, or filled in by JavaScript?)")
    return text


class _OfficialRedirects(urllib.request.HTTPRedirectHandler):
    """Follows a redirect only to another official URL, within the deadline."""

    max_redirections = MAX_REDIRECTS

    def __init__(self, deadline: float) -> None:
        super().__init__()
        self.deadline = deadline

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: IO[bytes],
        code: int,
        msg: str,
        headers: http.client.HTTPMessage,
        newurl: str,
    ) -> urllib.request.Request | None:
        if not is_official_url(newurl):
            raise NotOfficialUrlError(req.full_url, f"redirected to a non-government address: {newurl}")
        if _now() > self.deadline:
            raise FetchTimeoutError(req.full_url, f"timed out after {TIMEOUT_SECONDS:g}s")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _now() -> float:
    return time.monotonic()


def _download(url: str) -> tuple[bytes, str]:
    """The body and the declared content type ("" if none) of a 200 answer."""
    deadline = _now() + TIMEOUT_SECONDS
    # Cookies are enabled because some government sites redirect in a loop without them; the jar
    # lives for this one call, so nothing carries over between citizens' requests.
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), _OfficialRedirects(deadline)
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with opener.open(request, timeout=TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise LiveFetchError(url, f"HTTP {response.status} {response.reason}")
            body = _read_body(url, response, deadline)
            declared = response.headers.get_content_type() if response.headers.get("Content-Type") else ""
            return body, declared
    except urllib.error.HTTPError as error:  # before URLError, which it extends
        raise LiveFetchError(url, f"HTTP {error.code} {error.reason}") from error
    except urllib.error.URLError as error:
        if isinstance(error.reason, TimeoutError):
            raise FetchTimeoutError(url, f"timed out after {TIMEOUT_SECONDS:g}s") from error
        raise LiveFetchError(url, f"could not connect: {error.reason}") from error
    except TimeoutError as error:
        raise FetchTimeoutError(url, f"timed out after {TIMEOUT_SECONDS:g}s") from error
    except (http.client.HTTPException, OSError) as error:
        raise LiveFetchError(url, f"the connection failed: {error}") from error


def _read_body(url: str, response: http.client.HTTPResponse, deadline: float) -> bytes:
    declared_length = _declared_length(response)
    if declared_length is not None and declared_length > MAX_BYTES:
        raise LiveFetchError(url, f"the page is {declared_length:,} bytes, over the {MAX_BYTES:,} limit")
    chunks: list[bytes] = []
    size = 0
    while chunk := response.read(READ_CHUNK_BYTES):
        size += len(chunk)
        if size > MAX_BYTES:
            raise LiveFetchError(url, f"the page is over the {MAX_BYTES:,} byte limit")
        if _now() > deadline:
            raise FetchTimeoutError(url, f"timed out after {TIMEOUT_SECONDS:g}s")
        chunks.append(chunk)
    # http.client hands back a short body without complaint when the connection drops early.
    if declared_length is not None and size != declared_length:
        raise LiveFetchError(url, f"the download was cut short ({size:,} of {declared_length:,} bytes)")
    return b"".join(chunks)


def _declared_length(response: http.client.HTTPResponse) -> int | None:
    value = (response.headers.get("Content-Length") or "").strip()
    return int(value) if value.isdigit() else None


def _extract(url: str, body: bytes, content_type: str) -> str:
    # Government servers often mislabel a PDF, so the first bytes decide before the header does.
    is_pdf = body.startswith(b"%PDF-") or content_type == "application/pdf"
    if not is_pdf and content_type not in HTML_TYPES:
        raise LiveFetchError(url, f"unsupported content type {content_type or '(none)'}: only PDF and HTML are read")
    try:
        return _pdf_lines(pdf_pages(io.BytesIO(body))) if is_pdf else _html_blocks(html_text(body))
    except Exception as error:  # deliberately broad: parsers raise many types on damaged input
        raise LiveFetchError(url, f"could not read the {'PDF' if is_pdf else 'HTML'}: {error}") from error


def _html_blocks(text: str) -> str:
    """One line per block of the page. html_text() separates blocks (paragraphs, table rows) with
    blank lines, so a newline inside a block is just the HTML source wrapping and becomes a space."""
    blocks = (" ".join(block.split()) for block in BLANK_LINE.split(text))
    return "\n".join(block for block in blocks if block)


def _pdf_lines(pages: list[str]) -> str:
    """One line per printed line. A PDF has no blocks to go on, only the lines pypdf found."""
    lines = (" ".join(line.split()) for page in pages for line in page.splitlines())
    return "\n".join(line for line in lines if line)
