"""Reverse geocoding via OpenStreetMap's Nominatim — free, no API key or billing account,
unlike Google Maps' Geocoding API.

Usage policy (https://operations.osmfoundation.org/policies/nominatim/) requires a real,
identifying User-Agent header; never remove it. This app's volume is far below the policy's
rate limit (1 request/second), so no separate throttling is implemented here.

When Nominatim refuses (it blocks the shared addresses of free cloud hosts), the same
coordinates go to Photon instead: a second free OpenStreetMap service, run by Komoot. Only the
coordinates of the pin are sent, as to Nominatim.
"""

import logging
import threading
import time

import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
# Photon (by Komoot, also OpenStreetMap data, also free and keyless) answers when Nominatim
# refuses: Nominatim blocks the shared addresses of free cloud hosts such as Render.
PHOTON_URL = "https://photon.komoot.io/reverse"
USER_AGENT = "RTI-Copilot/0.1 (student OJT project; github.com/shivaansh0610-LUFFY/RTI-Copilot)"
TIMEOUT_SECONDS = 5.0


logger = logging.getLogger(__name__)


class GeocodingError(Exception):
    """The coordinates could not be turned into an address."""


# The policy allows at most one request a second. The frontend already waits for the pin to
# settle, but /geocode is a public endpoint, so the server keeps to the limit itself too.
MIN_INTERVAL_SECONDS = 1.0
_throttle = threading.Lock()
_last_call = 0.0


def _wait_for_turn() -> None:
    global _last_call
    with _throttle:
        wait = _last_call + MIN_INTERVAL_SECONDS - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()


def reverse_geocode(latitude: float, longitude: float) -> str:
    _wait_for_turn()
    try:
        return _nominatim(latitude, longitude)
    except GeocodingError as first:
        try:
            return _photon(latitude, longitude)
        except GeocodingError as second:
            # Logged, or an outage of the fallback would hide behind Nominatim's error.
            logger.warning("Both geocoders failed: Nominatim (%s), then Photon (%s)", first, second)
            raise first from None


def _nominatim(latitude: float, longitude: float) -> str:
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

    try:
        data = response.json()
    except ValueError as error:
        raise GeocodingError("the geocoding service sent an unreadable answer") from error
    if not isinstance(data, dict) or "error" in data or not data.get("display_name"):
        raise GeocodingError(f"no address found for ({latitude}, {longitude})")
    return _short_address(data)


def _photon(latitude: float, longitude: float) -> str:
    try:
        response = httpx.get(
            PHOTON_URL,
            params={"lat": latitude, "lon": longitude, "limit": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        raise GeocodingError(f"could not reach the fallback geocoding service: {error}") from error
    # Any other shape than the documented GeoJSON is "no address", never a server error.
    features = payload.get("features") if isinstance(payload, dict) else None
    first = features[0] if isinstance(features, list) and features else None
    place = first.get("properties") if isinstance(first, dict) else None
    if not isinstance(place, dict):
        raise GeocodingError(f"no address found for ({latitude}, {longitude})")
    road = _text(place.get("street")) or _text(place.get("name"))
    area = _text(place.get("locality")) or _text(place.get("district"))
    city = _text(place.get("city")) or _text(place.get("county")) or _text(place.get("state"))
    parts = list(dict.fromkeys(part for part in (road, area, city) if part))
    if not parts:
        raise GeocodingError(f"no address found for ({latitude}, {longitude})")
    return ", ".join(parts)


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _short_address(data: dict) -> str:
    """A short "road, area, city" form, more useful for an RTI request than Nominatim's
    full display_name (which includes postcode, country, etc.)."""
    address = data.get("address") or {}
    road = address.get("road") or address.get("pedestrian") or address.get("neighbourhood")
    area = address.get("suburb") or address.get("city_district") or address.get("county")
    city = address.get("city") or address.get("town") or address.get("state_district")
    parts = [part for part in (road, area, city) if part]
    return ", ".join(parts) if parts else data["display_name"]
