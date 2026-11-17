"""Live PWD Delhi project data, straight from the same JSON API the department's own
"Work Report" page (pwddelhi.gov.in/project-work-report) calls client-side -- found by reading
that page's own scripts (assets/js/project-search-*.js, common-filters-*.js). It calls
GET /api/projects/search, no authentication required.

Nothing here is pre-ingested: every call asks the live site again (results are only kept for a
half an hour, see CACHE_SECONDS), same spirit as app.services.live_fetch, just for a JSON endpoint
instead of an HTML/PDF page (which is why this is a separate module -- live_fetch's extractor
only understands HTML and PDF).

Reading the road categories takes about 15 seconds the first time (about 30 pages; the site
answers at roughly two pages a second however many are asked for at once, so more workers do
not help), and is instant for the next CACHE_SECONDS. warm_up() does that first read when the
API starts, off the request path.

What was checked by hand against the live API (17 Nov 2026), not assumed:

* "page" is 0-based (the site's own script says so; page=0 returns first=true). An earlier
  version of this module asked for page=1, which is really the second page.
* "size" is capped at 100 whatever is asked for, so a category is read page by page.
* The Category dropdown filters with categoryId (ids from /api/common/project-categories).
  That is a different taxonomy from sectorId: a project with sector_id 24 ("Road") can have
  category_id 2, 7, 56 or none at all. This module filters by categoryId only.
* Reading every page of a category in the feed's default order is complete and repeatable
  (Road: 13 pages, 1,291 projects, identical across two runs; the one project that shows up
  twice at a page boundary is dropped by id). Sorting (sortBy=id) is NOT safe: it dropped
  155 of those 1,291 projects. So no sort parameter is sent.
* Category is optional on a project: of 13,221 projects, 5,626 (43%) have none, and a
  categoryId filter can never return them. Of the projects whose name mentions a road, only
  about a quarter are in the "Road" category (the rest sit in "A/R & M/O", "Other", other
  free-text categories, or have none). A match here is a genuine find; a non-match is
  inconclusive, never a "no".
* The bare host pwddelhi.gov.in answers with a 301 to www.pwddelhi.gov.in, so the www host is
  used directly (one request per page instead of two).
"""

import json
import logging
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

logger = logging.getLogger(__name__)

SEARCH_URL = "https://www.pwddelhi.gov.in/api/projects/search"
PAGE_SIZE = 100  # the largest the API gives; asking for more still returns 100
MAX_PAGES = 40  # per category: a runaway guard, ~4,000 projects (the largest category has 21 pages)
WORKERS = 4  # pages fetched at once; the site answers in about a second each
CACHE_SECONDS = 1800  # the project list changes slowly, and a missed new project is only ever "inconclusive"
# The same API the modal's own "Details" tab calls (assets/js/project-details-modal.js) --
# a specific, citable record for one project, unlike SOURCE_PAGE_URL below which is just
# the generic search page a citizen would have to re-search from scratch.
PROJECT_URL = "https://pwddelhi.gov.in/api/projects"
TIMEOUT_SECONDS = 5.0
USER_AGENT = "Mozilla/5.0 (compatible; RTI-Copilot-live/0.1)"
# Where a citizen can browse this data themselves if they want the search UI instead of the
# raw API response -- individual projects have no bookmarkable page of their own (the real
# site opens them in a modal over the search results, not a separate URL). Its own search box
# (and the API's "search" param behind it, confirmed by hand) finds a project by project_id,
# so RoadProject.project_id below is what a citizen types in there to get the exact one back.
SOURCE_PAGE_URL = "https://pwddelhi.gov.in/project-work-report"

# Category ids from GET /api/common/project-categories (checked 17 Nov 2026). Only the first
# eleven are PWD's own list; the rest are labels officers typed in, but they hold real
# projects, so they are used where a topic needs them. Sizes are project counts that day.
ROAD = 2  # 1,291
PWD_ROADS = 56  # 115
RESTORATION_OF_ROAD = 90  # 43
ROAD_RESTORATION = 178  # 10
MCD_ROAD = 12  # 41
ROAD_AND_DRAIN = 160  # 2
AR_AND_MO = 69  # 1,586 -- "A/R & M/O": the general maintenance bucket, where most day-to-day repairs sit
OTHER = 7  # 736
BUILDING = 1  # 2,064
BUILDING_REPAIR = 64  # 27
FLYOVER = 3  # 10
FOB = 4  # 11
SUBWAY = 5  # 2
WATER_SUPPLY = 8  # 1
SEWER = 9  # 3
DESILTING = 11  # 29
MAINTENANCE_OF_DRAIN = 142  # 3
ELECTRICAL = 76  # "Electrical and Maintenance Services", 313
STREET_LIGHT_POLE = 60  # 9
STREET_LIGHT = 162  # 4
STREET_LIGHT_FITTINGS = 77  # 2
HORTICULTURE = 73  # "M/o Horti. Work", 36
COMPREHENSIVE_MAINTENANCE = 150  # 143, mostly horticulture and roadside maintenance
CULVERT = 128  # 5

# What a request is about, from its own words -> the categories that topic's projects sit in.
# Checked in this order; every topic that matches adds its categories. Topic words are
# deliberately the plain ones a citizen writes ("road", "drain", "streetlight").
TOPICS: list[tuple[str, re.Pattern[str], tuple[int, ...]]] = [
    (
        "road",
        re.compile(
            r"\broads?\b|\bmarg\b|\bstreets?\b|\bpothole|\bresurfac|\bcarriageway|\bfootpath|\bpavement"
            r"|\basphalt|\bpatchwork|\bpatching",
            re.IGNORECASE,
        ),
        (ROAD, PWD_ROADS, RESTORATION_OF_ROAD, ROAD_RESTORATION, MCD_ROAD, ROAD_AND_DRAIN, AR_AND_MO),
    ),
    (
        "drain",
        re.compile(
            r"\bdrain|\bdrainage\b|\bnall?ah|\bdesilt|\bsilt\b|\bsewer|\bsewage|\bwaterlogg?ing|\bmanholes?\b|\bstorm\s?water",
            re.IGNORECASE,
        ),
        (DESILTING, MAINTENANCE_OF_DRAIN, SEWER, ROAD_AND_DRAIN, ROAD, AR_AND_MO),
    ),
    (
        "streetlight",
        re.compile(r"\bstreet\s?-?lights?\b|\bhigh\s?mast|\blamp\s?posts?\b|\blighting\b|\bstreet\s?lamps?\b", re.IGNORECASE),
        (STREET_LIGHT_POLE, STREET_LIGHT, STREET_LIGHT_FITTINGS, ELECTRICAL, OTHER),
    ),
    (
        "water",
        re.compile(r"\bwater\s+(supply|pipe|line|tank)|\bpipelines?\b|\bborewell|\btube\s?wells?\b", re.IGNORECASE),
        (WATER_SUPPLY, AR_AND_MO),
    ),
    (
        "bridge",
        re.compile(r"\bflyovers?\b|\bbridges?\b|\bculverts?\b|\bunderpass|\boverbridge", re.IGNORECASE),
        (FLYOVER, CULVERT, ROAD),
    ),
    ("subway", re.compile(r"\bsubways?\b", re.IGNORECASE), (SUBWAY, ROAD)),
    ("footbridge", re.compile(r"\bfob\b|\bfoot\s?over\s?bridge|\bfoot\s?bridge", re.IGNORECASE), (FOB, ROAD)),
    (
        "park",
        re.compile(r"\bparks?\b|\bhorticulture|\btrees?\b|\bplantation|\bgardens?\b", re.IGNORECASE),
        (HORTICULTURE, COMPREHENSIVE_MAINTENANCE),
    ),
    (
        "building",
        re.compile(r"\bbuildings?\b|\bschools?\b|\bhospitals?\b|\bquarters\b", re.IGNORECASE),
        (BUILDING, BUILDING_REPAIR),
    ),
]
# A request that names none of these topics is still a PWD road grievance, so it is checked
# against the road categories, the closest thing to what this module always looked at.
DEFAULT_CATEGORIES = TOPICS[0][2]


class RoadProjectsFetchError(Exception):
    """The live projects feed could not be read."""


@dataclass(frozen=True)
class RoadProject:
    id: int
    project_id: str
    name: str
    status: str
    tender_status: str

    @property
    def searchable_text(self) -> str:
        return f"{self.name} | {self.status} | {self.tender_status}"

    @property
    def url(self) -> str:
        """This project's own record -- specific and citable, not the generic search page."""
        return f"{PROJECT_URL}/{self.id}"


def categories_for(text: str) -> list[int]:
    """The category ids whose projects could hold the record this text asks about, without
    repeats, in the order of the topics that matched. DEFAULT_CATEGORIES when no topic is named."""
    found: list[int] = []
    for _name, pattern, category_ids in TOPICS:
        if pattern.search(text):
            found.extend(category_id for category_id in category_ids if category_id not in found)
    return found or list(DEFAULT_CATEGORIES)


def fetch_road_projects(page: int = 0, category_id: int | None = None) -> list[RoadProject]:
    """One page (0-based) of up to 100 projects, from one category or from the whole feed."""
    return _fetch_page(page, category_id)[0]


def _fetch_page(page: int, category_id: int | None) -> tuple[list[RoadProject], int]:
    """(the projects on this page, the number of pages in the whole result)."""
    query: dict[str, int] = {"page": page, "size": PAGE_SIZE}
    if category_id is not None:
        query["categoryId"] = category_id
    request = urllib.request.Request(
        f"{SEARCH_URL}?{urllib.parse.urlencode(query)}",
        headers={
            "User-Agent": USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise RoadProjectsFetchError(f"HTTP {response.status}")
            payload = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise RoadProjectsFetchError(f"could not reach the live projects feed: {error}") from error
    except json.JSONDecodeError as error:
        raise RoadProjectsFetchError(f"the feed did not return valid JSON: {error}") from error

    raw_projects = payload.get("content") if isinstance(payload, dict) else None
    if not isinstance(raw_projects, list):
        raise RoadProjectsFetchError(f"unexpected response shape: {payload!r}")
    total_pages = payload.get("totalPages")
    if not isinstance(total_pages, int) or total_pages < 0:
        total_pages = 1

    projects = []
    for project in raw_projects:
        name = str(project.get("project_name") or "").strip()
        internal_id = project.get("id")
        project_id = str(project.get("project_id") or "").strip()
        if not name or not project_id or not isinstance(internal_id, int):
            continue
        projects.append(
            RoadProject(
                id=internal_id,
                project_id=project_id,
                name=name,
                status=str(project.get("status") or "").strip(),
                tender_status=str(project.get("tender_status") or "").strip(),
            )
        )
    return projects, total_pages


def fetch_category_projects(category_id: int) -> list[RoadProject]:
    """Every project in one category: all its pages, each project once.

    Page 0 decides how many pages there are; the rest are read WORKERS at a time. If page 0
    cannot be read this raises, like fetch_road_projects. If a later page cannot be read, the
    pages that did arrive are returned -- a match among them is still real, and a miss was
    never proof of anything -- unless nothing at all could be read.
    """
    cached = _cache_get(category_id)
    if cached is not None:
        return cached

    first_page, total_pages = _fetch_page(0, category_id)
    pages = min(total_pages, MAX_PAGES)

    def read(page: int) -> list[RoadProject] | None:
        try:
            return _fetch_page(page, category_id)[0]
        except RoadProjectsFetchError:
            return None

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        later = list(pool.map(read, range(1, pages)))

    complete = all(page is not None for page in later)
    unique: dict[int, RoadProject] = {}  # a project can appear twice where two pages meet
    for chunk in [first_page, *(page for page in later if page is not None)]:
        for project in chunk:
            unique.setdefault(project.id, project)
    projects = list(unique.values())
    if complete:
        _cache_put(category_id, projects)  # a partial read is not kept; the next request retries
    return projects


def fetch_projects_for(text: str) -> list[RoadProject]:
    """Every project in the categories `text` is about (see categories_for), each once.

    A category that cannot be read at all is skipped; this raises only if none could be.
    """
    projects: dict[int, RoadProject] = {}
    errors: list[RoadProjectsFetchError] = []
    for category_id in categories_for(text):
        try:
            for project in fetch_category_projects(category_id):
                projects.setdefault(project.id, project)
        except RoadProjectsFetchError as error:
            errors.append(error)
    if errors and not projects:
        raise errors[0]
    return list(projects.values())


# --- a few minutes of memory, so the several requests of one application share one crawl ------

_cache: dict[int, tuple[float, list[RoadProject]]] = {}
_cache_lock = threading.Lock()


def _cache_get(category_id: int) -> list[RoadProject] | None:
    with _cache_lock:
        entry = _cache.get(category_id)
    if entry is None or time.monotonic() - entry[0] > CACHE_SECONDS:
        return None
    return entry[1]


def _cache_put(category_id: int, projects: list[RoadProject]) -> None:
    with _cache_lock:
        _cache[category_id] = (time.monotonic(), projects)


def warm_up() -> None:
    """Reads the default (road) categories now so the first citizen does not wait for it.
    Never raises: if the site is down, the first real request simply reads them itself."""
    try:
        fetch_projects_for("")
    except Exception:
        logger.warning("Could not warm up the PWD projects cache", exc_info=True)


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()
