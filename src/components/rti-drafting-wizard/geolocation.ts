import type { IssueLocation } from "./location";

export type LocationFailure = "unsupported" | "insecure" | "denied" | "unavailable" | "timeout";

// Shown to the citizen as they are, so each one says what to do next.
const MESSAGES: Record<LocationFailure, string> = {
  unsupported: "This browser can't detect your location. Tap the map to place the pin instead.",
  insecure:
    "Your location can only be read on a secure (https) page. Tap the map to place the pin instead.",
  denied:
    "Location permission was denied. Allow it in your browser settings, or tap the map to place the pin instead.",
  unavailable: "Your location couldn't be determined. Tap the map to place the pin instead.",
  timeout: "Finding your location took too long. Try again, or tap the map to place the pin.",
};

export class LocationError extends Error {
  reason: LocationFailure;

  constructor(reason: LocationFailure) {
    super(MESSAGES[reason]);
    this.name = "LocationError";
    this.reason = reason;
  }
}

// The numeric codes of GeolocationPositionError, which is not available outside a browser.
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

// Asks the browser for the device's position. The browser shows its own permission prompt the
// first time; nothing is read until the citizen allows it.
export function getDeviceLocation(): Promise<IssueLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new LocationError("unsupported"));
    // Browsers refuse location on plain http, except on localhost.
    if (window.isSecureContext === false) return reject(new LocationError("insecure"));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: coords.accuracy,
        }),
      ({ code }) =>
        reject(
          new LocationError(
            code === PERMISSION_DENIED ? "denied" : code === TIMEOUT ? "timeout" : "unavailable",
          ),
        ),
      // High accuracy asks a phone for GPS rather than the nearest mast: the difference between
      // the right house and the next street.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
