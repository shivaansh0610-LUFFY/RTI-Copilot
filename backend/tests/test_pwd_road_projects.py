import json
import urllib.error
import urllib.parse

import pytest

from app.services import pwd_road_projects


@pytest.fixture(autouse=True)
def _fresh_cache():
    pwd_road_projects.clear_cache()
    yield
    pwd_road_projects.clear_cache()


class FakeResponse:
    def __init__(self, payload: bytes, status: int = 200):
        self._payload = payload
        self.status = status

    def read(self):
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_fetch_road_projects_returns_one_entry_per_named_project(monkeypatch):
    payload = json.dumps(
        {
            "content": [
                {
                    "id": 138871,
                    "project_id": "PWD-138871",
                    "project_name": "Repair of Guru Ravidass Road",
                    "status": "working",
                    "tender_status": "awarded",
                },
                {
                    "id": 2,
                    "project_id": "PWD-2",
                    "project_name": "",
                    "status": "working",
                    "tender_status": "awarded",
                },  # unnamed, skipped
                {"project_name": "No id field", "status": "working", "tender_status": "awarded"},  # no id, skipped
                {
                    "id": 3,
                    "project_name": "No project_id field",
                    "status": "working",
                    "tender_status": "awarded",
                },  # no project_id, skipped
            ]
        }
    ).encode()
    monkeypatch.setattr(pwd_road_projects.urllib.request, "urlopen", lambda *a, **k: FakeResponse(payload))

    projects = pwd_road_projects.fetch_road_projects()

    assert len(projects) == 1
    assert projects[0].id == 138871
    assert projects[0].project_id == "PWD-138871"
    assert projects[0].name == "Repair of Guru Ravidass Road"
    assert projects[0].searchable_text == "Repair of Guru Ravidass Road | working | awarded"
    assert projects[0].url == "https://pwddelhi.gov.in/api/projects/138871"


def test_fetch_road_projects_raises_on_non_200(monkeypatch):
    monkeypatch.setattr(
        pwd_road_projects.urllib.request, "urlopen", lambda *a, **k: FakeResponse(b"{}", status=503)
    )

    with pytest.raises(pwd_road_projects.RoadProjectsFetchError):
        pwd_road_projects.fetch_road_projects()


def test_fetch_road_projects_raises_on_invalid_json(monkeypatch):
    monkeypatch.setattr(pwd_road_projects.urllib.request, "urlopen", lambda *a, **k: FakeResponse(b"not json"))

    with pytest.raises(pwd_road_projects.RoadProjectsFetchError):
        pwd_road_projects.fetch_road_projects()


def test_fetch_road_projects_raises_on_unexpected_shape(monkeypatch):
    monkeypatch.setattr(
        pwd_road_projects.urllib.request, "urlopen", lambda *a, **k: FakeResponse(json.dumps({}).encode())
    )

    with pytest.raises(pwd_road_projects.RoadProjectsFetchError):
        pwd_road_projects.fetch_road_projects()


def test_fetch_road_projects_raises_on_connection_failure(monkeypatch):
    def raise_url_error(*a, **k):
        raise urllib.error.URLError("no route to host")

    monkeypatch.setattr(pwd_road_projects.urllib.request, "urlopen", raise_url_error)

    with pytest.raises(pwd_road_projects.RoadProjectsFetchError):
        pwd_road_projects.fetch_road_projects()


def test_urls_are_official_government_domains():
    from ingest.register_sources import is_official_url

    assert is_official_url(pwd_road_projects.SEARCH_URL)
    assert is_official_url(pwd_road_projects.SOURCE_PAGE_URL)
    assert is_official_url(pwd_road_projects.PROJECT_URL + "/1")


# --- reading a category, every page --------------------------------------------------------------


def project_json(number: int, name: str | None = None) -> dict:
    return {
        "id": number,
        "project_id": f"PWD-{number}",
        "project_name": name or f"Repair of road number {number}",
        "status": "working",
        "tender_status": "awarded",
    }


class FakeFeed:
    """Stands in for the live API: serves pages of a category, and remembers every request."""

    def __init__(self, pages_by_category: dict, fail_pages: set | None = None):
        self.pages_by_category = pages_by_category  # {category_id: [[project, ...], ...]}
        self.fail_pages = fail_pages or set()  # {(category_id, page)}
        self.requests: list[dict[str, str]] = []

    def __call__(self, request, timeout=None):
        query = {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(request.full_url).query).items()}
        self.requests.append({"url": request.full_url, **query})
        category, page = int(query["categoryId"]), int(query["page"])
        if (category, page) in self.fail_pages:
            raise urllib.error.URLError("connection reset")
        pages = self.pages_by_category[category]
        content = pages[page] if page < len(pages) else []
        return FakeResponse(json.dumps({"content": content, "totalPages": len(pages)}).encode())


def install(monkeypatch, feed: FakeFeed) -> FakeFeed:
    monkeypatch.setattr(pwd_road_projects.urllib.request, "urlopen", feed)
    return feed


def test_a_page_request_names_the_category_and_a_zero_based_page(monkeypatch):
    feed = install(monkeypatch, FakeFeed({2: [[project_json(1)], [project_json(2)]]}))

    projects = pwd_road_projects.fetch_road_projects(page=1, category_id=2)

    assert [p.id for p in projects] == [2]
    request = feed.requests[0]
    assert request["url"].startswith("https://www.pwddelhi.gov.in/api/projects/search?")
    assert (request["page"], request["size"], request["categoryId"]) == ("1", "100", "2")
    # The old fixed filters are gone, and no sort is sent (sorting by id lost projects).
    assert not {"sectorId", "projectTypeId", "sortBy", "sortOrder"} & request.keys()


def test_the_whole_feed_is_asked_for_when_no_category_is_given(monkeypatch):
    seen = []

    def urlopen(request, timeout=None):
        seen.append(request.full_url)
        return FakeResponse(json.dumps({"content": [project_json(1)]}).encode())

    monkeypatch.setattr(pwd_road_projects.urllib.request, "urlopen", urlopen)

    pwd_road_projects.fetch_road_projects()

    assert "categoryId" not in seen[0] and "page=0" in seen[0]


def test_every_page_of_a_category_is_read_and_each_project_kept_once(monkeypatch):
    # Project 3 shows up on two pages where they meet, as the live feed does.
    feed = install(
        monkeypatch,
        FakeFeed({2: [[project_json(1), project_json(2), project_json(3)], [project_json(3), project_json(4)], [project_json(5)]]}),
    )

    projects = pwd_road_projects.fetch_category_projects(2)

    assert sorted(p.id for p in projects) == [1, 2, 3, 4, 5]
    assert sorted(int(r["page"]) for r in feed.requests) == [0, 1, 2]


def test_a_single_page_category_is_read_with_one_request(monkeypatch):
    feed = install(monkeypatch, FakeFeed({9: [[project_json(1)]]}))

    assert [p.id for p in pwd_road_projects.fetch_category_projects(9)] == [1]
    assert len(feed.requests) == 1


def test_an_empty_category_gives_no_projects(monkeypatch):
    install(monkeypatch, FakeFeed({9: []}))

    assert pwd_road_projects.fetch_category_projects(9) == []


def test_a_category_is_read_again_only_after_the_cache_expires(monkeypatch):
    feed = install(monkeypatch, FakeFeed({2: [[project_json(1)]]}))
    clock = [1000.0]
    monkeypatch.setattr(pwd_road_projects.time, "monotonic", lambda: clock[0])

    pwd_road_projects.fetch_category_projects(2)
    pwd_road_projects.fetch_category_projects(2)
    assert len(feed.requests) == 1

    clock[0] += pwd_road_projects.CACHE_SECONDS + 1
    pwd_road_projects.fetch_category_projects(2)
    assert len(feed.requests) == 2


def test_the_pages_that_arrived_are_used_when_a_later_page_fails_and_not_cached(monkeypatch):
    feed = install(
        monkeypatch,
        FakeFeed({2: [[project_json(1)], [project_json(2)], [project_json(3)]]}, fail_pages={(2, 1)}),
    )

    projects = pwd_road_projects.fetch_category_projects(2)

    assert sorted(p.id for p in projects) == [1, 3]

    feed.fail_pages.clear()  # the next request tries again rather than trusting the partial read
    assert sorted(p.id for p in pwd_road_projects.fetch_category_projects(2)) == [1, 2, 3]


def test_a_category_whose_first_page_fails_raises(monkeypatch):
    install(monkeypatch, FakeFeed({2: [[project_json(1)], [project_json(2)]]}, fail_pages={(2, 0)}))

    with pytest.raises(pwd_road_projects.RoadProjectsFetchError):
        pwd_road_projects.fetch_category_projects(2)


def test_a_runaway_category_is_cut_off_at_the_page_limit(monkeypatch):
    monkeypatch.setattr(pwd_road_projects, "MAX_PAGES", 3)
    feed = install(monkeypatch, FakeFeed({2: [[project_json(n)] for n in range(10)]}))

    projects = pwd_road_projects.fetch_category_projects(2)

    assert len(projects) == 3 and len(feed.requests) == 3


# --- which categories a request is about ---------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected", "not_expected"),
    [
        ("Copy of the work order for repair of the road outside my house", [pwd_road_projects.ROAD], []),
        ("Guru Ravidass Marg resurfacing estimate", [pwd_road_projects.ROAD, pwd_road_projects.AR_AND_MO], [pwd_road_projects.DESILTING]),
        ("Desilting of the drain near the school", [pwd_road_projects.DESILTING, pwd_road_projects.MAINTENANCE_OF_DRAIN], []),
        ("Streetlight not working on Ring Road", [pwd_road_projects.STREET_LIGHT, pwd_road_projects.ELECTRICAL, pwd_road_projects.ROAD], []),
        ("Waterlogging at the underpass", [pwd_road_projects.DESILTING, pwd_road_projects.FLYOVER], [pwd_road_projects.BUILDING]),
        ("Repair of the foot over bridge", [pwd_road_projects.FOB], []),
        ("Maintenance of the park", [pwd_road_projects.HORTICULTURE], [pwd_road_projects.ROAD]),
        ("Repair of the school building", [pwd_road_projects.BUILDING], [pwd_road_projects.ROAD]),
    ],
)
def test_categories_follow_what_the_request_is_about(text, expected, not_expected):
    found = pwd_road_projects.categories_for(text)

    for category in expected:
        assert category in found
    for category in not_expected:
        assert category not in found
    assert len(found) == len(set(found))


def test_a_request_that_names_no_topic_is_checked_against_the_road_categories():
    assert pwd_road_projects.categories_for("Copy of the sanction order") == list(pwd_road_projects.DEFAULT_CATEGORIES)
    assert pwd_road_projects.categories_for("") == list(pwd_road_projects.DEFAULT_CATEGORIES)


def test_topic_words_match_whole_words_only():
    # "broadway" is not "road", "treetop" is not "street".
    assert pwd_road_projects.categories_for("Broadway treetop") == list(pwd_road_projects.DEFAULT_CATEGORIES)
    assert pwd_road_projects.categories_for("Broadway treetop park") == [
        pwd_road_projects.HORTICULTURE,
        pwd_road_projects.COMPREHENSIVE_MAINTENANCE,
    ]


# --- reading the categories of one request -------------------------------------------------------


def test_the_projects_of_every_matching_category_are_joined_once(monkeypatch):
    feed = install(
        monkeypatch,
        FakeFeed(
            {
                pwd_road_projects.DESILTING: [[project_json(1), project_json(2)]],
                pwd_road_projects.MAINTENANCE_OF_DRAIN: [[project_json(2), project_json(3)]],
                pwd_road_projects.SEWER: [[]],
                pwd_road_projects.ROAD_AND_DRAIN: [[project_json(4)]],
                pwd_road_projects.ROAD: [[project_json(5)]],
                pwd_road_projects.AR_AND_MO: [[project_json(6)]],
            }
        ),
    )

    projects = pwd_road_projects.fetch_projects_for("Desilting of the drain")

    assert sorted(p.id for p in projects) == [1, 2, 3, 4, 5, 6]
    assert {int(r["categoryId"]) for r in feed.requests} == {
        pwd_road_projects.DESILTING,
        pwd_road_projects.MAINTENANCE_OF_DRAIN,
        pwd_road_projects.SEWER,
        pwd_road_projects.ROAD_AND_DRAIN,
        pwd_road_projects.ROAD,
        pwd_road_projects.AR_AND_MO,
    }


def test_an_unreadable_category_is_skipped_if_another_could_be_read(monkeypatch):
    pages = {category: [[project_json(category)]] for category in pwd_road_projects.DEFAULT_CATEGORIES}
    install(monkeypatch, FakeFeed(pages, fail_pages={(pwd_road_projects.ROAD, 0)}))

    projects = pwd_road_projects.fetch_projects_for("road")

    assert pwd_road_projects.ROAD not in {p.id for p in projects}
    assert len(projects) == len(pwd_road_projects.DEFAULT_CATEGORIES) - 1


def test_it_raises_when_no_category_could_be_read(monkeypatch):
    pages = {category: [[project_json(category)]] for category in pwd_road_projects.DEFAULT_CATEGORIES}
    install(monkeypatch, FakeFeed(pages, fail_pages={(category, 0) for category in pages}))

    with pytest.raises(pwd_road_projects.RoadProjectsFetchError):
        pwd_road_projects.fetch_projects_for("road")


def test_warm_up_fills_the_cache_so_the_first_request_needs_no_network(monkeypatch):
    feed = install(monkeypatch, FakeFeed({category: [[project_json(category)]] for category in pwd_road_projects.DEFAULT_CATEGORIES}))

    pwd_road_projects.warm_up()
    asked = len(feed.requests)
    projects = pwd_road_projects.fetch_projects_for("road")

    assert asked == len(pwd_road_projects.DEFAULT_CATEGORIES)
    assert len(feed.requests) == asked  # nothing new was fetched
    assert len(projects) == len(pwd_road_projects.DEFAULT_CATEGORIES)


def test_warm_up_never_raises_when_the_site_is_down(monkeypatch):
    def down(*args, **kwargs):
        raise urllib.error.URLError("no route to host")

    monkeypatch.setattr(pwd_road_projects.urllib.request, "urlopen", down)

    pwd_road_projects.warm_up()  # must not raise
