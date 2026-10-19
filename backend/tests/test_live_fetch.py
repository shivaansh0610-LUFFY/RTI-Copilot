"""Tests for app.services.live_fetch.

No test touches the network. The fake replaces http.client's connection classes, the lowest
layer, so everything above it is the real thing: urllib's redirect, cookie and error handling,
and http.client's parsing of a genuine HTTP response (including its habit of handing back a
short body without complaint when the connection drops).
"""

import http.client
import io
import socket
import ssl
from collections.abc import Callable
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import pytest
from corpus_support import make_pdf

from app.services import live_fetch
from app.services.live_fetch import (
    EmptyPageError,
    FetchTimeoutError,
    LiveFetchError,
    NotOfficialUrlError,
    fetch_live_text,
)

URL = "https://pgc.delhi.gov.in/pgc-cause-list-annexure-2"

# --- a fake web -------------------------------------------------------------------------------


@dataclass
class Reply:
    """What a fake server answers. `content_length` overrides the real length (to fake a body that
    is cut short); `no_length` leaves the header out; `stall` makes the connection go silent once
    the body sent so far has been read."""

    body: bytes = b""
    status: int = 200
    content_type: str | None = "text/html; charset=utf-8"
    headers: dict[str, str] = field(default_factory=dict)
    content_length: int | None = None
    no_length: bool = False
    stall: bool = False

    def raw(self) -> bytes:
        headers = dict(self.headers)
        if self.content_type is not None:
            headers["Content-Type"] = self.content_type
        if self.no_length:
            headers["Connection"] = "close"
        else:
            headers["Content-Length"] = str(len(self.body) if self.content_length is None else self.content_length)
        reason = http.client.responses.get(self.status, "Status")
        head = f"HTTP/1.1 {self.status} {reason}\r\n" + "".join(f"{k}: {v}\r\n" for k, v in headers.items())
        return head.encode() + b"\r\n" + self.body


@dataclass
class Seen:
    url: str
    method: str
    headers: dict[str, str]


class Clock:
    def __init__(self, now: float = 1000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


class Stream(io.BytesIO):
    """The socket's read side. Header lines come through readline; body reads come through read,
    which is where a stalled connection or a slow server shows up."""

    def __init__(self, data: bytes, stall: bool, on_read: Callable[[], None]) -> None:
        super().__init__(data)
        self.stall = stall
        self.on_read = on_read

    def flush(self) -> None:  # http.client flushes on close, maybe after the stream was freed
        pass

    def read(self, size: int | None = -1) -> bytes:
        self.on_read()
        data = super().read(size)
        if not data and self.stall:
            raise TimeoutError("timed out")
        return data


class Socket:
    def __init__(self, stream: Stream) -> None:
        self.stream = stream

    def makefile(self, *args, **kwargs) -> Stream:
        return self.stream


class FakeWeb:
    def __init__(self, clock: Clock) -> None:
        self.clock = clock
        self.routes: dict[str, Reply | Callable[[Seen], Reply]] = {}
        self.failures: dict[str, tuple[str, BaseException]] = {}
        self.requests: list[Seen] = []
        self.seconds_per_request = 0.0  # how far each request moves the clock
        self.seconds_per_read = 0.0  # how far each read of a body moves it

    def add(self, url: str, reply: Reply | Callable[[Seen], Reply]) -> None:
        self.routes[url] = reply

    def fail(self, url: str, error: BaseException, when: str = "request") -> None:
        """Raise `error` while sending the request (a failed connect) or waiting for the answer."""
        self.failures[url] = (when, error)

    def connection(self, scheme: str) -> type:
        web = self
        # Subclassing keeps the class attributes urllib reads; only the network I/O is replaced.
        real = http.client.HTTPSConnection if scheme == "https" else http.client.HTTPConnection

        class Connection(real):
            sock = None

            def __init__(self, host: str, timeout: float | None = None, **kwargs) -> None:
                self.base = f"{scheme}://{host}"

            def set_debuglevel(self, level: int) -> None:
                pass

            def request(self, method, selector, body=None, headers=None, **kwargs) -> None:
                self.seen = Seen(self.base + selector, method, {k.lower(): v for k, v in (headers or {}).items()})
                web.requests.append(self.seen)
                web.clock.now += web.seconds_per_request
                if (failure := web.failures.get(self.seen.url)) and failure[0] == "request":
                    raise failure[1]

            def getresponse(self) -> http.client.HTTPResponse:
                if (failure := web.failures.get(self.seen.url)) and failure[0] == "response":
                    raise failure[1]
                assert self.seen.url in web.routes, f"unexpected request to {self.seen.url}"
                route = web.routes[self.seen.url]
                reply = route(self.seen) if callable(route) else route
                stream = Stream(reply.raw(), reply.stall, lambda: setattr(web.clock, "now", web.clock.now + web.seconds_per_read))
                response = http.client.HTTPResponse(Socket(stream))
                response.begin()
                return response

            def close(self) -> None:
                pass

        return Connection

    def urls(self) -> list[str]:
        return [seen.url for seen in self.requests]


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    clock = Clock()
    monkeypatch.setattr(live_fetch, "_now", clock)
    return clock


@pytest.fixture
def web(monkeypatch: pytest.MonkeyPatch, clock: Clock) -> FakeWeb:
    web = FakeWeb(clock)
    monkeypatch.setattr(http.client, "HTTPSConnection", web.connection("https"))
    monkeypatch.setattr(http.client, "HTTPConnection", web.connection("http"))
    return web


def redirect(to: str, status: int = 302, **headers: str) -> Reply:
    return Reply(status=status, content_type=None, headers={"Location": to, **headers})


# --- a successful fetch -----------------------------------------------------------------------

CAUSE_LIST = b"""<html><head><title>Cause list</title><style>td {color: red}</style></head>
<body>
<nav><a href="/">Home</a><a href="/about">About Us</a></nav>
<script>var tracking = 1;</script>
<h1>PGC Cause List (Annexure-2)</h1>
<table>
  <tr><th>S. No.</th><th>Diary No.</th><th>Respondent Dept.</th><th>N.D.O.H/Status</th></tr>
  <tr><td>1</td><td>1326</td><td>Public Works Department</td><td>Disposed of</td></tr>
  <tr><td>2</td><td>3407</td><td>Delhi Jal Board</td><td>12.11.2026</td></tr>
</table>
<footer>Last Updated: 16/10/2026</footer>
</body></html>"""


def test_html_page_is_fetched_and_its_text_extracted(web):
    web.add(URL, Reply(CAUSE_LIST))

    text = fetch_live_text(URL)

    assert isinstance(text, str)
    lines = text.splitlines()
    assert "PGC Cause List (Annexure-2)" in lines
    assert "S. No. | Diary No. | Respondent Dept. | N.D.O.H/Status" in lines
    assert "1 | 1326 | Public Works Department | Disposed of" in lines  # a table row stays on one line
    assert "2 | 3407 | Delhi Jal Board | 12.11.2026" in lines
    for chrome in ["Home", "About Us", "tracking", "color: red", "Last Updated"]:
        assert chrome not in text


def test_html_source_wrapping_is_joined_and_each_block_gets_one_line(web):
    # A sentence wrapped across source lines is one block; a phrase must not be broken in two.
    page = b"<html><body><p>  Order   passed on\n 5 October,\n matter  Disposed\n of.</p><p></p><p>Next   item.</p></body></html>"
    web.add(URL, Reply(page))

    assert fetch_live_text(URL) == "Order passed on 5 October, matter Disposed of.\nNext item."


def test_the_request_is_a_get_with_a_browser_style_agent(web):
    web.add(URL, Reply(CAUSE_LIST))

    fetch_live_text(URL)

    assert [(seen.url, seen.method) for seen in web.requests] == [(URL, "GET")]
    assert web.requests[0].headers["user-agent"].startswith("Mozilla/5.0")


def test_a_pdf_is_fetched_and_its_pages_joined(web):
    pdf = make_pdf([["Order No. 123 dated 5 October 2026"], [], ["The matter stands closed."]])
    web.add(URL, Reply(pdf, content_type="application/pdf"))

    text = fetch_live_text(URL)

    assert text.splitlines() == ["Order No. 123 dated 5 October 2026", "The matter stands closed."]


def test_the_lines_of_a_pdf_page_stay_separate(web):
    pdf = make_pdf([["1326  Disposed of", "3407   12.11.2026"]])
    web.add(URL, Reply(pdf, content_type="application/pdf"))

    assert fetch_live_text(URL) == "1326 Disposed of\n3407 12.11.2026"


def test_a_pdf_labelled_as_html_is_still_read_as_a_pdf(web):
    web.add(URL, Reply(make_pdf([["Order of the Commission"]]), content_type="text/html"))

    assert fetch_live_text(URL) == "Order of the Commission"


def test_a_pdf_with_no_content_type_at_all_is_still_read(web):
    web.add(URL, Reply(make_pdf([["Order of the Commission"]]), content_type=None))

    assert fetch_live_text(URL) == "Order of the Commission"


def test_plain_http_on_an_official_domain_is_allowed(web):
    web.add("http://tender.nic.in/notice", Reply(b"<html><body><p>Notice of hearing</p></body></html>"))

    assert fetch_live_text("http://tender.nic.in/notice") == "Notice of hearing"


def test_every_call_goes_to_the_site_again(web):
    web.add(URL, Reply(b"<html><body><p>Status: pending</p></body></html>"))
    assert fetch_live_text(URL) == "Status: pending"

    web.add(URL, Reply(b"<html><body><p>Status: disposed of</p></body></html>"))

    assert fetch_live_text(URL) == "Status: disposed of"
    assert web.urls() == [URL, URL]


# --- only official domains --------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "https://example.com/page",
        "https://www.pwddelhi.com/",  # PWD Delhi's older complaint site: .com, so not official
        "https://pwddelhi.s3.ap-south-1.amazonaws.com/documents/policy.pdf",
        "https://evilgov.in/page",  # ends in "gov.in" but is not a .gov.in host
        "https://gov.in.evil.com/page",
        "https://www.pwddelhi.gov.in.evil.com/page",
        "ftp://files.nic.in/page",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "www.pwddelhi.gov.in/rules-and-records",  # no scheme
        "",
    ],
)
def test_a_url_outside_the_official_domains_is_refused_before_any_request(web, url):
    with pytest.raises(NotOfficialUrlError):
        fetch_live_text(url)

    assert web.requests == []


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308])
def test_a_redirect_off_the_official_domain_is_refused_and_never_followed(web, status):
    web.add(URL, redirect("https://example.com/landing", status))

    with pytest.raises(NotOfficialUrlError, match="redirected to a non-government address"):
        fetch_live_text(URL)

    assert web.urls() == [URL]  # the other host was never asked


@pytest.mark.parametrize(
    "target",
    [
        "//example.com/landing",  # protocol-relative: same scheme, other host
        "https://pgc.delhi.gov.in.example.com/landing",
        "http://example.com/landing",
        "ftp://files.example.com/landing",
    ],
)
def test_sneakier_redirects_off_the_domain_are_refused_too(web, target):
    web.add(URL, redirect(target))

    with pytest.raises(NotOfficialUrlError):
        fetch_live_text(URL)

    assert web.urls() == [URL]


def test_a_redirect_that_leaves_the_domain_later_in_the_chain_is_refused(web):
    web.add(URL, redirect("https://pgc.delhi.gov.in/step-two"))
    web.add("https://pgc.delhi.gov.in/step-two", redirect("https://example.com/landing"))

    with pytest.raises(NotOfficialUrlError):
        fetch_live_text(URL)

    assert web.urls() == [URL, "https://pgc.delhi.gov.in/step-two"]


def test_redirects_within_official_domains_are_followed(web):
    web.add("http://pwddelhi.gov.in/rules", redirect("https://pwddelhi.gov.in/rules", 301))
    web.add("https://pwddelhi.gov.in/rules", redirect("https://www.pwddelhi.gov.in/rules-and-records", 302))
    web.add("https://www.pwddelhi.gov.in/rules-and-records", Reply(b"<html><body><p>Manual 5</p></body></html>"))

    assert fetch_live_text("http://pwddelhi.gov.in/rules") == "Manual 5"
    assert len(web.requests) == 3


def test_a_relative_redirect_is_followed(web):
    web.add(URL, redirect("/pgc-cause-list/13031"))
    web.add("https://pgc.delhi.gov.in/pgc-cause-list/13031", Reply(b"<html><body><p>Hearing order</p></body></html>"))

    assert fetch_live_text(URL) == "Hearing order"


def test_a_site_that_redirects_until_it_gets_its_cookie_is_handled(web):
    # cpwd.gov.in does this: it redirects to itself in a loop unless the cookie it set comes back.
    def site(seen: Seen) -> Reply:
        if "session=abc" in seen.headers.get("cookie", ""):
            return Reply(b"<html><body><p>Welcome</p></body></html>")
        return redirect(URL, **{"Set-Cookie": "session=abc; Path=/"})

    web.add(URL, site)

    assert fetch_live_text(URL) == "Welcome"
    assert len(web.requests) == 2


def test_cookies_do_not_carry_over_to_the_next_call(web):
    def site(seen: Seen) -> Reply:
        if "session=abc" in seen.headers.get("cookie", ""):
            return Reply(b"<html><body><p>Welcome</p></body></html>")
        return redirect(URL, **{"Set-Cookie": "session=abc; Path=/"})

    web.add(URL, site)
    fetch_live_text(URL)
    web.requests.clear()

    fetch_live_text(URL)

    assert "cookie" not in web.requests[0].headers  # the first request of the second call starts fresh


def test_a_redirect_loop_gives_up(web):
    web.add(URL, redirect(URL))

    with pytest.raises(LiveFetchError):
        fetch_live_text(URL)

    assert len(web.requests) <= live_fetch.MAX_REDIRECTS + 1


# --- failures that are not the page's fault ---------------------------------------------------


@pytest.mark.parametrize("status", [403, 404, 500, 503])
def test_an_error_status_is_reported_with_its_code(web, status):
    web.add(URL, Reply(b"<html><body><p>An error page with plenty of text</p></body></html>", status=status))

    with pytest.raises(LiveFetchError, match=f"HTTP {status}") as error:
        fetch_live_text(URL)

    assert type(error.value) is LiveFetchError


def test_a_success_status_other_than_200_is_not_accepted(web):
    web.add(URL, Reply(status=204, content_type=None))

    with pytest.raises(LiveFetchError, match="HTTP 204"):
        fetch_live_text(URL)


@pytest.mark.parametrize(
    "error",
    [
        ConnectionRefusedError("connection refused"),
        socket.gaierror("Name or service not known"),
        ssl.SSLCertVerificationError("certificate verify failed"),
    ],
)
def test_a_connection_that_cannot_be_made_is_reported(web, error):
    web.fail(URL, error)

    with pytest.raises(LiveFetchError, match="could not connect") as raised:
        fetch_live_text(URL)

    assert not isinstance(raised.value, FetchTimeoutError)


def test_a_connection_dropped_before_any_answer_is_reported(web):
    web.fail(URL, http.client.RemoteDisconnected("Remote end closed connection without response"), when="response")

    with pytest.raises(LiveFetchError, match="the connection failed"):
        fetch_live_text(URL)


# --- timeouts ---------------------------------------------------------------------------------


@pytest.mark.parametrize("when", ["request", "response"])
def test_a_timeout_while_connecting_or_waiting_is_reported_as_one(web, when):
    web.fail(URL, TimeoutError("timed out"), when=when)

    with pytest.raises(FetchTimeoutError, match="timed out after 5s") as error:
        fetch_live_text(URL)

    assert error.value.url == URL


def test_a_timeout_in_the_middle_of_the_body_is_not_returned_as_a_partial_page(web):
    # The server promises 10,000 bytes, sends 100, then goes silent.
    web.add(URL, Reply(b"<html><body><p>" + b"x" * 85, content_length=10_000, stall=True))

    with pytest.raises(FetchTimeoutError):
        fetch_live_text(URL)


def test_a_server_that_drips_its_answer_is_stopped_at_the_deadline(web):
    web.add(URL, Reply(b"<html><body><p>" + b"word " * 40_000 + b"</p></body></html>"))  # about 200 KB
    web.seconds_per_read = 2.0  # every read is "fast" on its own, but they add up

    with pytest.raises(FetchTimeoutError):
        fetch_live_text(URL)


def test_a_redirect_chain_that_runs_past_the_deadline_is_stopped(web):
    web.add(URL, redirect("https://pgc.delhi.gov.in/step-two"))
    web.add("https://pgc.delhi.gov.in/step-two", Reply(CAUSE_LIST))
    web.seconds_per_request = live_fetch.TIMEOUT_SECONDS + 1

    with pytest.raises(FetchTimeoutError):
        fetch_live_text(URL)

    assert web.urls() == [URL]  # the second hop was never made


# --- bodies that cannot be trusted ------------------------------------------------------------


def test_a_body_cut_short_is_an_error_not_a_partial_page(web):
    # http.client returns the 100 bytes it got without complaint; the module must notice.
    web.add(URL, Reply(b"<html><body><p>Status: disp", content_length=500))

    with pytest.raises(LiveFetchError, match="cut short"):
        fetch_live_text(URL)


def test_a_page_declared_too_big_is_refused(web, monkeypatch):
    monkeypatch.setattr(live_fetch, "MAX_BYTES", 1000)
    web.add(URL, Reply(b"<html><body><p>" + b"x" * 5000 + b"</p></body></html>"))

    with pytest.raises(LiveFetchError, match="limit"):
        fetch_live_text(URL)


def test_a_page_of_unknown_length_that_grows_too_big_is_refused(web, monkeypatch):
    monkeypatch.setattr(live_fetch, "MAX_BYTES", 1000)
    web.add(URL, Reply(b"<html><body><p>" + b"x" * 5000 + b"</p></body></html>", no_length=True))

    with pytest.raises(LiveFetchError, match="limit"):
        fetch_live_text(URL)


@pytest.mark.parametrize(
    ("content_type", "shown"),
    [("application/json", "application/json"), ("image/png", "image/png"), (None, r"\(none\)")],
)
def test_content_that_is_neither_pdf_nor_html_is_refused(web, content_type, shown):
    web.add(URL, Reply(b'{"status": "disposed of"}', content_type=content_type))

    with pytest.raises(LiveFetchError, match=f"unsupported content type {shown}"):
        fetch_live_text(URL)


def test_an_html_error_page_served_as_a_pdf_is_an_error(web):
    web.add(URL, Reply(b"<html><body>Service temporarily unavailable</body></html>", content_type="application/pdf"))

    with pytest.raises(LiveFetchError, match="could not read the PDF"):
        fetch_live_text(URL)


def test_a_damaged_pdf_is_an_error(web):
    web.add(URL, Reply(b"%PDF-1.4\n1 0 obj << /Broken", content_type="application/pdf"))

    with pytest.raises(LiveFetchError, match="could not read the PDF"):
        fetch_live_text(URL)


# --- no text to extract -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "html",
    [
        b"",
        b"   \n  ",
        b"<html><body></body></html>",
        b"<html><head><title>Loading</title></head><body><script>render()</script><nav>Menu</nav></body></html>",
        b"<html><body><p>2026</p><p>12 - 34</p></body></html>",  # nothing but digits and punctuation
    ],
)
def test_a_page_with_no_text_is_an_error_not_an_empty_result(web, html):
    web.add(URL, Reply(html))

    with pytest.raises(EmptyPageError, match="no text") as error:
        fetch_live_text(URL)

    assert error.value.url == URL


def test_a_pdf_with_no_text_layer_is_an_error(web):
    web.add(URL, Reply(make_pdf([[], []]), content_type="application/pdf"))  # like a scan

    with pytest.raises(EmptyPageError):
        fetch_live_text(URL)


def test_a_page_filled_in_by_javascript_comes_back_as_its_empty_shell(web):
    # Known limit, pinned so nobody assumes otherwise: several PWD Delhi report pages are just
    # column names and "Loading..." until a script fills them in. That is text, so it is returned;
    # the caller must not read "my grievance is not in this table" from it.
    web.add(
        URL,
        Reply(
            b"<html><body><h1>Project / Works Report</h1><table>"
            b"<tr><th>S.No</th><th>Name of Work</th><th>Status</th></tr><tr><td>Loading...</td></tr>"
            b"</table></body></html>"
        ),
    )

    assert fetch_live_text(URL) == "Project / Works Report\nS.No | Name of Work | Status\nLoading..."


# --- the exceptions ---------------------------------------------------------------------------


def test_every_failure_is_a_live_fetch_error_that_names_the_url():
    for kind in (NotOfficialUrlError, FetchTimeoutError, EmptyPageError):
        assert issubclass(kind, LiveFetchError)

    error = LiveFetchError(URL, "HTTP 500 Internal Server Error")

    assert str(error) == f"{URL}: HTTP 500 Internal Server Error"
    assert (error.url, error.reason) == (URL, "HTTP 500 Internal Server Error")


def test_the_official_url_rule_is_the_one_register_sources_uses():
    from ingest.register_sources import is_official_url

    assert live_fetch.is_official_url is is_official_url
    assert urlsplit(URL).hostname.endswith(".gov.in")
