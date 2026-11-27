from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

PATTERN = r"https://rti-copilot-app01(-[a-z0-9-]+-shivaanshs-projects-7cc11c27)?\.vercel\.app"


def preflight(origin):
    return TestClient(app).options(
        "/health", headers={"Origin": origin, "Access-Control-Request-Method": "POST"}
    )


def test_the_regex_lets_every_vercel_address_of_the_site_in(monkeypatch):
    # The middleware reads the setting when the app is built, so check the pattern itself the way
    # Starlette uses it (a full match).
    import re

    allowed = re.compile(PATTERN)
    assert allowed.fullmatch("https://rti-copilot-app01.vercel.app")
    assert allowed.fullmatch("https://rti-copilot-app01-2m33m6mhc-shivaanshs-projects-7cc11c27.vercel.app")
    assert not allowed.fullmatch("https://rti-copilot-app01-evil.vercel.app")
    assert not allowed.fullmatch("https://example.com")


def test_render_yaml_sets_the_same_pattern():
    import pathlib

    text = (pathlib.Path(__file__).parents[2] / "render.yaml").read_text()
    assert PATTERN.replace("\\", "\\\\") in text or PATTERN in text


def test_without_the_setting_only_listed_origins_are_allowed():
    assert get_settings().cors_origin_regex == ""
    assert "access-control-allow-origin" not in preflight("https://rti-copilot-app01-x-shivaanshs-projects-7cc11c27.vercel.app").headers
