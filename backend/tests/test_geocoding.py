import httpx
import pytest

from app.services import geocoding


class FakeResponse:
    def __init__(self, json_data: dict, status_code: int = 200):
        self._json_data = json_data
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)

    def json(self):
        return self._json_data


DELHI_RESPONSE = {
    "display_name": "123, MG Road, Connaught Place, New Delhi, Delhi, 110001, India",
    "address": {
        "road": "MG Road",
        "suburb": "Connaught Place",
        "city": "New Delhi",
        "state": "Delhi",
        "postcode": "110001",
        "country": "India",
    },
}


def test_reverse_geocode_returns_a_short_address(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: FakeResponse(DELHI_RESPONSE))

    address = geocoding.reverse_geocode(28.6315, 77.2167)

    assert address == "MG Road, Connaught Place, New Delhi"


def test_reverse_geocode_sends_the_required_user_agent(monkeypatch):
    seen_headers = {}

    def fake_get(url, params, headers, timeout):
        seen_headers.update(headers)
        return FakeResponse(DELHI_RESPONSE)

    monkeypatch.setattr(httpx, "get", fake_get)

    geocoding.reverse_geocode(28.6315, 77.2167)

    assert "User-Agent" in seen_headers
    assert seen_headers["User-Agent"] == geocoding.USER_AGENT


def test_reverse_geocode_falls_back_to_display_name_when_address_parts_are_missing(monkeypatch):
    monkeypatch.setattr(
        httpx, "get", lambda *a, **k: FakeResponse({"display_name": "Somewhere, India", "address": {}})
    )

    assert geocoding.reverse_geocode(0, 0) == "Somewhere, India"


def test_reverse_geocode_raises_on_no_result(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: FakeResponse({"error": "Unable to geocode"}))

    with pytest.raises(geocoding.GeocodingError):
        geocoding.reverse_geocode(999, 999)


def test_reverse_geocode_raises_on_http_error(monkeypatch):
    def raise_timeout(*args, **kwargs):
        raise httpx.ConnectTimeout("timed out")

    monkeypatch.setattr(httpx, "get", raise_timeout)

    with pytest.raises(geocoding.GeocodingError):
        geocoding.reverse_geocode(28.6315, 77.2167)


def test_reverse_geocode_raises_on_server_error_status(monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: FakeResponse({}, status_code=503))

    with pytest.raises(geocoding.GeocodingError):
        geocoding.reverse_geocode(28.6315, 77.2167)
