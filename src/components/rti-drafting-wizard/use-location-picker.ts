import { useEffect, useRef, useState } from "react";
import { getDeviceLocation, LocationError } from "./geolocation";
import type { IssueLocation } from "./location";
import { reverseGeocode } from "./mocks";

// Nominatim, behind /geocode, allows one request a second; this app only ever sends one per GPS
// fix, so the delay here is just to let the UI settle before the lookup starts.
const GEOCODE_DELAY_MS = 600;

const NO_STREET_NAME =
  "No street name found for this spot. The coordinates will be added to your description instead.";
const NOT_FOUND = "Your location couldn't be determined.";

export interface LocationPicker {
  isLocating: boolean; // waiting for the browser's permission prompt or the GPS fix
  isLookingUp: boolean; // waiting for the street name
  message: string; // something to tell the citizen, or ""
  locateDevice: () => void; // use the device's position
  clear: () => void;
}

// Finds the spot from the device's GPS only -- no manual pin, so there is nothing for a citizen
// to misplace and no "this is the spot" claim the device itself didn't make. Keeps `location`
// (held by the caller) up to date: first the coordinates at once, then the street name when it
// arrives.
export function useLocationPicker(onLocationChange: (location: IssueLocation | undefined) => void): LocationPicker {
  const [isLocating, setIsLocating] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [message, setMessage] = useState("");

  // Every new GPS request and clear bumps this. An answer that arrives for an older one (a slow
  // GPS fix, a slow street-name lookup) is dropped, never applied over a newer request.
  const latest = useRef(0);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(lookupTimer.current);
      latest.current += 1;
    },
    [],
  );

  function lookUpStreetName(latitude: number, longitude: number, accuracyMeters: number | undefined, token: number) {
    clearTimeout(lookupTimer.current);
    setIsLookingUp(true);
    lookupTimer.current = setTimeout(() => {
      reverseGeocode(latitude, longitude)
        .then((address) => {
          if (token !== latest.current) return;
          if (address) onLocationChange({ latitude, longitude, accuracyMeters, address });
          else setMessage(NO_STREET_NAME);
        })
        .catch(() => {
          if (token === latest.current) setMessage(NO_STREET_NAME);
        })
        .finally(() => {
          if (token === latest.current) setIsLookingUp(false);
        });
    }, GEOCODE_DELAY_MS);
  }

  async function locateDevice() {
    const token = ++latest.current;
    setMessage("");
    setIsLocating(true);
    try {
      const fix = await getDeviceLocation();
      if (token !== latest.current) return;
      onLocationChange({ latitude: fix.latitude, longitude: fix.longitude, accuracyMeters: fix.accuracyMeters });
      lookUpStreetName(fix.latitude, fix.longitude, fix.accuracyMeters, token);
    } catch (error) {
      if (token === latest.current) {
        setMessage(error instanceof LocationError ? error.message : NOT_FOUND);
      }
    } finally {
      if (token === latest.current) setIsLocating(false);
    }
  }

  function clear() {
    latest.current += 1;
    clearTimeout(lookupTimer.current);
    setIsLookingUp(false);
    setMessage("");
    onLocationChange(undefined);
  }

  return { isLocating, isLookingUp, message, locateDevice, clear };
}
