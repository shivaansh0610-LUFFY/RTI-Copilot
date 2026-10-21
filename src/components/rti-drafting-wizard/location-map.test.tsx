// The real Leaflet map under jsdom. jsdom has no layout, so the map has no size and tiles never
// load; what it does show is whether the pin is created, moved, removed, and reported.
import { fireEvent, render } from "@testing-library/react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationMap from "./LocationMap";

// Leaflet is the real one; these only keep hold of the map and pins it creates, so a test can ask
// where a pin really is (its pixel position means nothing on a map with no size).
const created = vi.hoisted(() => ({ maps: [] as LeafletMap[], markers: [] as Marker[] }));
vi.mock("leaflet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("leaflet")>();
  return {
    ...actual,
    map: (...args: Parameters<typeof actual.map>) => {
      const map = actual.map(...args);
      created.maps.push(map);
      return map;
    },
    marker: (...args: Parameters<typeof actual.marker>) => {
      const marker = actual.marker(...args);
      created.markers.push(marker);
      return marker;
    },
  };
});

beforeEach(() => {
  created.maps.length = 0;
  created.markers.length = 0;
});

const spot = (marker: Marker) => ({ latitude: marker.getLatLng().lat, longitude: marker.getLatLng().lng });

const CONNAUGHT_PLACE = { latitude: 28.6315, longitude: 77.2167 };
const DWARKA = { latitude: 28.5921, longitude: 77.046 };

const pins = (container: HTMLElement) => container.querySelectorAll(".leaflet-marker-icon");

describe("LocationMap", () => {
  it("is a labelled map that credits OpenStreetMap", () => {
    const { container, getByRole } = render(<LocationMap location={undefined} onPick={vi.fn()} />);

    expect(getByRole("application").getAttribute("aria-label")).toMatch(/Tap to place the pin/);
    const credit = container.querySelector(".leaflet-control-attribution");
    expect(credit?.textContent).toContain("OpenStreetMap");
    const link = Array.from(credit?.querySelectorAll("a") ?? []).find(
      (anchor) => anchor.textContent === "OpenStreetMap",
    );
    expect(link?.getAttribute("href")).toBe("https://www.openstreetmap.org/copyright");
  });

  it("shows no pin until there is a location", () => {
    const { container } = render(<LocationMap location={undefined} onPick={vi.fn()} />);

    expect(pins(container)).toHaveLength(0);
  });

  it("puts the pin on the location, drawn without any image file", () => {
    const { container } = render(<LocationMap location={CONNAUGHT_PLACE} onPick={vi.fn()} />);

    expect(pins(container)).toHaveLength(1);
    expect(pins(container)[0].querySelector("svg")).not.toBeNull();
    expect(container.querySelector(".leaflet-marker-icon img")).toBeNull();
    expect(spot(created.markers[0])).toEqual(CONNAUGHT_PLACE);
  });

  it("zooms in to street level for the first pin, from the whole-city view", () => {
    render(<LocationMap location={CONNAUGHT_PLACE} onPick={vi.fn()} />);

    expect(created.maps[0].getZoom()).toBeGreaterThanOrEqual(17);
  });

  it("starts on Delhi when there is nothing to show yet", () => {
    render(<LocationMap location={undefined} onPick={vi.fn()} />);

    const centre = created.maps[0].getCenter();
    expect(centre.lat).toBeCloseTo(28.6139, 3);
    expect(centre.lng).toBeCloseTo(77.209, 3);
    expect(created.maps[0].getZoom()).toBe(11);
  });

  it("moves the one pin when the location changes, and does not add another", () => {
    const { container, rerender } = render(
      <LocationMap location={CONNAUGHT_PLACE} onPick={vi.fn()} />,
    );

    rerender(<LocationMap location={DWARKA} onPick={vi.fn()} />);

    expect(pins(container)).toHaveLength(1);
    expect(created.markers).toHaveLength(1);
    expect(spot(created.markers[0])).toEqual(DWARKA);
  });

  it("makes a pin that can be dragged", () => {
    render(<LocationMap location={CONNAUGHT_PLACE} onPick={vi.fn()} />);

    expect(created.markers[0].options.draggable).toBe(true);
  });

  it("reports the new spot when the pin is dropped", () => {
    const onPick = vi.fn();
    render(<LocationMap location={CONNAUGHT_PLACE} onPick={onPick} />);

    created.markers[0].setLatLng([28.61, 77.23]); // what Leaflet does as the pin is dragged
    created.markers[0].fire("dragend");

    expect(onPick).toHaveBeenCalledWith(28.61, 77.23);
  });

  it("takes the pin away when the location is cleared", () => {
    const { container, rerender } = render(
      <LocationMap location={CONNAUGHT_PLACE} onPick={vi.fn()} />,
    );

    rerender(<LocationMap location={undefined} onPick={vi.fn()} />);

    expect(pins(container)).toHaveLength(0);
  });

  it("reports the spot when the map is tapped", () => {
    const onPick = vi.fn();
    const { getByRole } = render(<LocationMap location={undefined} onPick={onPick} />);

    fireEvent.click(getByRole("application"), { clientX: 0, clientY: 0 });

    expect(onPick).toHaveBeenCalledTimes(1);
    const [latitude, longitude] = onPick.mock.calls[0];
    expect(latitude).toBeGreaterThan(20);
    expect(latitude).toBeLessThan(35);
    expect(longitude).toBeGreaterThan(70);
    expect(longitude).toBeLessThan(85);
  });

  it("calls the newest onPick, not the one it was first given", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { getByRole, rerender } = render(<LocationMap location={undefined} onPick={first} />);

    rerender(<LocationMap location={undefined} onPick={second} />);
    fireEvent.click(getByRole("application"), { clientX: 0, clientY: 0 });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("can be removed from the page without errors", () => {
    const { unmount } = render(<LocationMap location={CONNAUGHT_PLACE} onPick={vi.fn()} />);

    expect(() => unmount()).not.toThrow();
  });
});
