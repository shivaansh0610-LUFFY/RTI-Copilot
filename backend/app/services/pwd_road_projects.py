"""Live PWD Delhi road-maintenance project data, straight from the same JSON API the
department's own "Work Report > Maintenance Work > Road" page
(pwddelhi.gov.in/maintenance-work/road) calls client-side -- found by reading that page's
own script, assets/js/maintenance-work-road.js. It calls GET /api/projects/search with
sectorId=24 (Road) and projectTypeId=4 (Maintenance Work), no authentication required.

Nothing here is pre-ingested: every call asks the live site again, same spirit as
app.services.live_fetch, just for a JSON endpoint instead of an HTML/PDF page (which is why
this is a separate module -- live_fetch's extractor only understands HTML and PDF).

Only one page of ~100 is fetched out of roughly 1,700 projects in the full feed -- enough
to check "is this recent project already public", not a general search tool. Observed in
practice: which projects land in that page shifts between calls even minutes apart (the
feed has no documented stable sort), so a project not found here is not proof it isn't
public, only that it wasn't in this one page just now. Treat a match as a genuine, exciting
find; treat a non-match as inconclusive, not a "no".
"""

import json
import urllib.error
import urllib.request
from dataclasses import dataclass

SEARCH_URL = "https://pwddelhi.gov.in/api/projects/search"
# sectorId=24 (Road) and projectTypeId=4 (Maintenance Work) are the fixed filters the
# department's own road-maintenance page always sends. size=100 (the page itself requests
# 10) trades a bigger single call for better odds of covering a given project -- the feed's
# ordering was observed to shift between calls minutes apart, so even "page 1" is not a
# stable set from one request to the next.
PARAMS = "page=1&size=100&sectorId=24&projectTypeId=4"
# The same API the modal's own "Details" tab calls (assets/js/project-details-modal.js) --
# a specific, citable record for one project, unlike SOURCE_PAGE_URL below which is just
# the generic search page a citizen would have to re-search from scratch.
PROJECT_URL = "https://pwddelhi.gov.in/api/projects"
TIMEOUT_SECONDS = 5.0
USER_AGENT = "Mozilla/5.0 (compatible; RTI-Copilot-live/0.1)"
# Where a citizen can browse this data themselves if they want the search UI instead of the
# raw API response -- individual projects have no bookmarkable page of their own (the real
# site opens them in a modal over the search results, not a separate URL).
SOURCE_PAGE_URL = "https://pwddelhi.gov.in/maintenance-work/road"


class RoadProjectsFetchError(Exception):
    """The live road-projects feed could not be read."""


@dataclass(frozen=True)
class RoadProject:
    id: int
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


def fetch_road_projects() -> list[RoadProject]:
    request = urllib.request.Request(
        f"{SEARCH_URL}?{PARAMS}",
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

    raw_projects = payload.get("content")
    if not isinstance(raw_projects, list):
        raise RoadProjectsFetchError(f"unexpected response shape: {payload!r}")

    projects = []
    for project in raw_projects:
        name = str(project.get("project_name") or "").strip()
        project_id = project.get("id")
        if not name or not isinstance(project_id, int):
            continue
        projects.append(
            RoadProject(
                id=project_id,
                name=name,
                status=str(project.get("status") or "").strip(),
                tender_status=str(project.get("tender_status") or "").strip(),
            )
        )
    return projects
