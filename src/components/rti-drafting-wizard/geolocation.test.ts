import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceLocation, LocationError } from "./geolocation";

type Success = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type Failure = (error: { code: number }) => void;

let getCurrentPosition: ReturnType<typeof vi.fn<(success: Success, failure: Failure, options: object) => void>>;

function setGeolocation(value: unknown) {
  Object.defineProperty(navigator, "geolocation", { value, configurable: true });
}

function setSecure(value: boolean | undefined) {
  Object.defineProperty(window, "isSecureContext", { value, configurable: true });
}

beforeEach(() => {
  getCurrentPosition = vi.fn();
  setGeolocation({ getCurrentPosition });
  setSecure(true);
});

afterEach(() => {
  setGeolocation(undefined);
  setSecure(true);
});

describe("getDeviceLocation", () => {
  it("resolves with the position and how accurate it is", async () => {
    getCurrentPosition.mockImplementation((success) =>
      success({ coords: { latitude: 28.6315, longitude: 77.2167, accuracy: 12.4 } }),
    );

    await expect(getDeviceLocation()).resolves.toEqual({
      latitude: 28.6315,
      longitude: 77.2167,
      accuracyMeters: 12.4,
    });
  });

  it("asks for GPS-grade accuracy, a fresh reading, and gives up after 15 seconds", async () => {
    getCurrentPosition.mockImplementation((success) =>
      success({ coords: { latitude: 1, longitude: 2, accuracy: 3 } }),
    );

    await getDeviceLocation();

    expect(getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    });
  });

  it.each([
    [1, "denied", "permission was denied"],
    [2, "unavailable", "couldn't be determined"],
    [3, "timeout", "took too long"],
    [99, "unavailable", "couldn't be determined"],
  ])("maps browser error code %i to %s", async (code, reason, text) => {
    getCurrentPosition.mockImplementation((_success, failure) => failure({ code }));

    const error = await getDeviceLocation().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LocationError);
    expect((error as LocationError).reason).toBe(reason);
    expect((error as LocationError).message).toContain(text);
  });

  it("tells the citizen what to do next, in every failure", async () => {
    for (const code of [1, 2, 3]) {
      getCurrentPosition.mockImplementation((_success, failure) => failure({ code }));
      const error = await getDeviceLocation().catch((caught: unknown) => caught);
      expect((error as LocationError).message).toMatch(/map|Try again/);
    }
  });

  it("reports a browser with no location support, without trying", async () => {
    setGeolocation(undefined);

    await expect(getDeviceLocation()).rejects.toMatchObject({ reason: "unsupported" });
  });

  it("reports an insecure page without asking the browser, which would only refuse", async () => {
    setSecure(false);

    await expect(getDeviceLocation()).rejects.toMatchObject({ reason: "insecure" });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});
