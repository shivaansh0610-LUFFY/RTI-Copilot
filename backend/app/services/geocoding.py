"""Reverse geocoding via OpenStreetMap's Nominatim — free, no API key or billing account,
unlike Google Maps' Geocoding API.

Usage policy (https://operations.osmfoundation.org/policies/nominatim/) requires a real,
identifying User-Agent header; never remove it. This app's volume is far below the policy's
rate limit (1 request/second), so no separate throttling is implemented here.
"""

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "RTI-Copilot/0.1 (student OJT project; github.com/shivaansh0610-LUFFY/RTI-Copilot)"
TIMEOUT_SECONDS = 5.0


class GeocodingError(Exception):
    """The coordinates could not be turned into an address."""


def reverse_geocode(latitude: float, longitude: float) -> str:
    try:
        response = httpx.get(
            NOMINATIM_URL,
            params={"format": "jsonv2", "lat": latitude, "lon": longitude, "zoom": 18, "addressdetails": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise GeocodingError(f"could not reach the geocoding service: {error}") from error

    data = response.json()
    if "error" in data or not data.get("display_name"):
        raise GeocodingError(f"no address found for ({latitude}, {longitude})")
    return _short_address(data)


def _short_address(data: dict) -> str:
    """A short "road, area, city" form, more useful for an RTI request than Nominatim's
    full display_name (which includes postcode, country, etc.)."""
    address = data.get("address") or {}
    road = address.get("road") or address.get("pedestrian") or address.get("neighbourhood")
    area = address.get("suburb") or address.get("city_district") or address.get("county")
    city = address.get("city") or address.get("town") or address.get("state_district")
    parts = [part for part in (road, area, city) if part]
    return ", ".join(parts) if parts else data["display_name"]
