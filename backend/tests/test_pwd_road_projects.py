import json
import urllib.error

import pytest

from app.services import pwd_road_projects


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
                    "project_name": "Repair of Guru Ravidass Road",
                    "status": "working",
                    "tender_status": "awarded",
                },
                {"id": 2, "project_name": "", "status": "working", "tender_status": "awarded"},  # unnamed, skipped
                {"project_name": "No id field", "status": "working", "tender_status": "awarded"},  # no id, skipped
            ]
        }
    ).encode()
    monkeypatch.setattr(pwd_road_projects.urllib.request, "urlopen", lambda *a, **k: FakeResponse(payload))

    projects = pwd_road_projects.fetch_road_projects()

    assert len(projects) == 1
    assert projects[0].id == 138871
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
