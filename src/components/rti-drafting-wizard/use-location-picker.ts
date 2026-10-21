import { useEffect, useRef, useState } from "react";
import { getDeviceLocation, LocationError } from "./geolocation";
import type { IssueLocation } from "./location";
import { reverseGeocode } from "./mocks";

// Nominatim, behind /geocode, allows one request a second. Waiting this long after the last
// move of the pin keeps a citizen dragging it from sending one request per nudge.
const GEOCODE_DELAY_MS = 600;

const NO_STREET_NAME =
  "No street name found for this spot. The coordinates will be added to your description instead.";
const NOT_FOUND = "Your location couldn't be determined. Tap the map to place the pin instead.";

export interface LocationPicker {
  isLocating: boolean; // waiting for the browser's permission prompt or the GPS fix
  isLookingUp: boolean; // waiting for the street name
  message: string; // something to tell the citizen, or ""
  showMap: boolean;
  locateDevice: () => void; // use the device's position
  place: (latitude: number, longitude: number, accuracyMeters?: number) => void; // pin put here
  openMap: () => void;
  clear: () => void;
}

// Finds the spot, from the device's GPS or a pin the citizen places, and keeps `location` (held by
// the caller) up to date: first the coordinates at once, then the street name when it arrives.
export function useLocationPicker(
  location: IssueLocation | undefined,
  onLocationChange: (location: IssueLocation | undefined) => void,
): LocationPicker {
  const [isLocating, setIsLocating] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [message, setMessage] = useState("");
  const [showMap, setShowMap] = useState(location !== undefined);

  // Every new position, GPS request and clear bumps this. An answer that arrives for an older one
  // (a slow GPS fix, a slow street-name lookup) is dropped, never applied over a newer pin.
  const latest = useRef(0);
  const pendingFixes = useRef(0);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(lookupTimer.current);
      latest.current += 1;
    },
    [],
  );

  function place(latitude: number, longitude: number, accuracyMeters?: number) {
    const token = ++latest.current;
    clearTimeout(lookupTimer.current);
    setShowMap(true);
    setMessage("");
    setIsLookingUp(true);
    onLocationChange({ latitude, longitude, accuracyMeters });

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
    pendingFixes.current += 1;
    setMessage("");
    setShowMap(true);
    setIsLocating(true);
    try {
      const fix = await getDeviceLocation();
      // A pin placed meanwhile wins over the GPS fix, which is then ignored.
      if (token === latest.current) place(fix.latitude, fix.longitude, fix.accuracyMeters);
    } catch (error) {
      if (token === latest.current) {
        setMessage(error instanceof LocationError ? error.message : NOT_FOUND);
      }
    } finally {
      pendingFixes.current -= 1;
      setIsLocating(pendingFixes.current > 0);
    }
  }

  function clear() {
    latest.current += 1;
    clearTimeout(lookupTimer.current);
    setIsLookingUp(false);
    setMessage("");
    setShowMap(false);
    onLocationChange(undefined);
  }

  return {
    isLocating,
    isLookingUp,
    message,
    showMap,
    locateDevice,
    place,
    openMap: () => setShowMap(true),
    clear,
  };
}
