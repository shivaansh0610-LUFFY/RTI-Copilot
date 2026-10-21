import "leaflet/dist/leaflet.css";
import {
  divIcon,
  latLng,
  map as createMap,
  marker as createMarker,
  tileLayer,
  type Map as LeafletMap,
  type Marker,
} from "leaflet";
import { useEffect, useRef } from "react";
import { DELHI_CENTER, type IssueLocation } from "./location";

// OpenStreetMap's public tile server. Its usage policy asks for visible attribution (below) and
// light use, which a map opened by one citizen at a time stays well inside; a deployment with many
// users should move to a tile provider it has an agreement with.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

const WHOLE_CITY_ZOOM = 11;
const STREET_ZOOM = 17;

// Drawn here so there are no image files for the bundler to find (Leaflet's own marker pictures
// are a known source of broken pins).
const PIN = divIcon({
  className: "",
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 26.6 16 39 16 39s15-12.4 15-23.2C31 7.6 24.3 1 16 1z" fill="#dc2626" stroke="#ffffff" stroke-width="2"/><circle cx="16" cy="16" r="5.5" fill="#ffffff"/></svg>`,
});

// A map with one draggable pin. Tapping the map or dropping the pin reports the new position;
// the parent owns the position and passes it back in.
export default function LocationMap({
  location,
  onPick,
}: {
  location: IssueLocation | undefined;
  onPick: (latitude: number, longitude: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  // Leaflet's listeners are attached once, so they call the newest onPick through this.
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  });

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const map = createMap(node).setView([DELHI_CENTER.latitude, DELHI_CENTER.longitude], WHOLE_CITY_ZOOM);
    tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    map.on("click", (event) => onPickRef.current(event.latlng.lat, event.latlng.lng));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  const latitude = location?.latitude;
  const longitude = location?.longitude;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (latitude === undefined || longitude === undefined) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const position = latLng(latitude, longitude);
    const existing = markerRef.current;
    if (existing) {
      existing.setLatLng(position);
      // A pin the citizen just dropped is already in view; only follow it if it has gone off screen.
      if (!map.getBounds().contains(position)) map.panTo(position);
      return;
    }

    const pin = createMarker(position, { icon: PIN, draggable: true, title: "Drag to move the pin" });
    pin.on("dragend", () => {
      const moved = pin.getLatLng();
      onPickRef.current(moved.lat, moved.lng);
    });
    pin.addTo(map);
    markerRef.current = pin;
    // The first pin: zoom in from the whole-city view so the citizen can fine-tune it.
    map.setView(position, Math.max(map.getZoom(), STREET_ZOOM));
  }, [latitude, longitude]);

  return (
    <div
      ref={container}
      role="application"
      aria-label="Map. Tap to place the pin on the problem, or drag the pin to adjust it."
      className="h-64 w-full rounded-md border border-slate-300"
    />
  );
}
