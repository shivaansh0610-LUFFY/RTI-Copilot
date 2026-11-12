// The Describe step as a citizen meets it: the real wizard, with only the network (mocks.ts) and
// the browser's geolocation faked. Location comes from the device's GPS only -- there is no
// manual pin to fake or to test.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import RtiDraftingWizard from "./index";
import { createCase, getClarifyQuestions, reverseGeocode } from "./mocks";

vi.mock("./mocks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mocks")>()),
  reverseGeocode: vi.fn(),
  createCase: vi.fn(),
  // Continuing from Describe also fetches clarify questions (it may skip straight past
  // Clarify if the grievance already answered everything); mocked here too so this file's
  // "no network for the photo" tests aren't tripped up by that unrelated call.
  getClarifyQuestions: vi.fn(),
}));

const CONNAUGHT_PLACE = { latitude: 28.6315, longitude: 77.2167 };
const ADDRESS = "MG Road, Karol Bagh, New Delhi";

let getCurrentPosition: ReturnType<typeof vi.fn>;

function setBrowser({ secure = true }: { secure?: boolean } = {}) {
  getCurrentPosition = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
  Object.defineProperty(window, "isSecureContext", { value: secure, configurable: true });
}

function gpsFix(position: { latitude: number; longitude: number }, accuracy = 8) {
  getCurrentPosition.mockImplementation((success) =>
    success({ coords: { ...position, accuracy } }),
  );
}

function gpsFails(code: number) {
  getCurrentPosition.mockImplementation((_success, failure) => failure({ code }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  setBrowser();
  URL.createObjectURL = vi.fn(() => "blob:the-photo");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(reverseGeocode).mockReset().mockResolvedValue(ADDRESS);
  vi.mocked(createCase).mockReset().mockResolvedValue("case-1");
  // At least one question, so the wizard lands on Clarify rather than skipping straight to
  // decompose (another unmocked network call these tests don't care about).
  vi.mocked(getClarifyQuestions).mockReset().mockResolvedValue({
    answers: {},
    questions: [{ key: "period", question: "What time period does this relate to?", options: ["Last 1 year"] }],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Lets promises settle (a GPS fix resolving) without moving the clock.
const flush = () => act(async () => {});
// Moves the clock past the pause before the street name is looked up, then lets it answer.
const waitForLookup = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });

const description = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const type = (value: string) => fireEvent.change(description(), { target: { value } });

async function choosePhoto(
  label = "Photo from camera",
  file = new File(["pixels"], "pothole.jpg", { type: "image/jpeg" }),
) {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
  await flush();
}

describe("taking a photo", () => {
  it("shows the photo, finds the spot, and writes it into the description", async () => {
    gpsFix(CONNAUGHT_PLACE, 12);
    render(<RtiDraftingWizard />);

    await choosePhoto();

    expect(screen.getByAltText("The photo you added")).toBeTruthy();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(description().value).toBe("Location: 28.63150, 77.21670");
    expect(screen.getByText(/GPS accuracy about 12 m/)).toBeTruthy();

    await waitForLookup();

    expect(reverseGeocode).toHaveBeenCalledWith(28.6315, 77.2167);
    expect(description().value).toBe(`Location: ${ADDRESS} (28.63150, 77.21670)`);
  });

  it("says plainly that the photo stays on the device", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);

    await choosePhoto();

    expect(screen.getByText(/stays on this device and isn't sent anywhere/)).toBeTruthy();
  });

  it("works the same for a photo picked from the gallery", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);

    await choosePhoto("Photo from gallery");

    expect(screen.getByAltText("The photo you added")).toBeTruthy();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("opens the camera on a phone, and the plain picker for the gallery", () => {
    render(<RtiDraftingWizard />);

    expect(screen.getByLabelText("Photo from camera").getAttribute("capture")).toBe("environment");
    expect(screen.getByLabelText("Photo from gallery").hasAttribute("capture")).toBe(false);
    for (const label of ["Photo from camera", "Photo from gallery"]) {
      expect(screen.getByLabelText(label).getAttribute("accept")).toBe("image/*");
    }
  });

  it("does not start a second GPS request for a spot already found", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();
    await waitForLookup();
    getCurrentPosition.mockClear();

    await choosePhoto(); // and then adds a photo of the same spot

    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("refuses a file that is not an image, and never asks for the location", async () => {
    render(<RtiDraftingWizard />);

    await choosePhoto("Photo from gallery", new File(["%PDF"], "form.pdf", { type: "application/pdf" }));

    expect(screen.getByText("Please choose a photo (an image file).")).toBeTruthy();
    expect(screen.queryByAltText("The photo you added")).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("removes the photo and frees it, but keeps the spot", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);
    await choosePhoto();

    fireEvent.click(screen.getByRole("button", { name: /Remove photo/ }));
    await flush();

    expect(screen.queryByAltText("The photo you added")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:the-photo");
    expect(description().value).toContain("Location:");
  });
});

describe("when the location cannot be found", () => {
  it.each([
    [1, /permission was denied/],
    [2, /couldn't be determined/],
    [3, /took too long/],
  ])("explains browser error %i", async (code, message) => {
    gpsFails(code);
    render(<RtiDraftingWizard />);

    await choosePhoto();

    expect(screen.getByText(message)).toBeTruthy();
    expect(description().value).toBe("");
  });

  it("explains an insecure page, which browsers refuse to give a location", async () => {
    setBrowser({ secure: false });
    render(<RtiDraftingWizard />);

    await choosePhoto();

    expect(screen.getByText(/secure \(https\) page/)).toBeTruthy();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("keeps the photo even when there is no location", async () => {
    gpsFails(1);
    render(<RtiDraftingWizard />);

    await choosePhoto();

    expect(screen.getByAltText("The photo you added")).toBeTruthy();
  });
});

describe("the existing 'Use my current location' button", () => {
  it("finds the spot the same way, with no photo", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();
    await waitForLookup();

    expect(description().value).toBe(`Location: ${ADDRESS} (28.63150, 77.21670)`);
    expect(screen.queryByAltText("The photo you added")).toBeNull();
  });

  it("is disabled while the browser is still deciding", async () => {
    getCurrentPosition.mockImplementation(() => {}); // never answers
    render(<RtiDraftingWizard />);
    const button = screen.getByRole("button", { name: /Use my current location/ }) as HTMLButtonElement;

    fireEvent.click(button);
    await flush();

    expect(button.disabled).toBe(true);
    expect(screen.getByText(/If your browser asks, choose Allow/)).toBeTruthy();
  });
});

describe("the street name", () => {
  it("does not overwrite words typed while it was loading", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();

    type(`${description().value}\n\nIt is a deep pothole.`); // typing while the lookup is pending
    await waitForLookup();

    expect(description().value).toContain("It is a deep pothole.");
    expect(description().value).toContain(`Location: ${ADDRESS} (28.63150, 77.21670)`);
  });

  it("ignores a slow answer for a spot the citizen has since re-located from", async () => {
    let answerForFirstSpot: (address: string) => void = () => {};
    vi.mocked(reverseGeocode)
      .mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => (answerForFirstSpot = resolve)))
      .mockResolvedValue("Second Street, Civil Lines");
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();
    await waitForLookup(); // the lookup for the first spot is now in flight, unanswered
    gpsFix({ latitude: 28.7041, longitude: 77.1025 });
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ })); // re-locate
    await flush();
    await act(async () => {
      answerForFirstSpot("First Street, Karol Bagh"); // ...and now the old answer arrives
    });
    expect(description().value).not.toContain("First Street");

    await waitForLookup();

    expect(description().value).toBe("Location: Second Street, Civil Lines (28.70410, 77.10250)");
  });

  it("falls back to the coordinates when no street name is found", async () => {
    vi.mocked(reverseGeocode).mockResolvedValue(undefined);
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();
    await waitForLookup();

    expect(screen.getByText(/No street name found for this spot/)).toBeTruthy();
    expect(description().value).toBe("Location: 28.63150, 77.21670");
  });

  it("falls back the same way when the lookup fails", async () => {
    vi.mocked(reverseGeocode).mockRejectedValue(new Error("422"));
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();
    await waitForLookup();

    expect(screen.getByText(/No street name found for this spot/)).toBeTruthy();
    expect(description().value).toBe("Location: 28.63150, 77.21670");
  });
});

describe("the detected spot", () => {
  it("is cleared from the description by 'Clear location'", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);
    type("A pothole outside my house.");
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();
    await waitForLookup();

    fireEvent.click(screen.getByRole("button", { name: /Clear location/ }));
    await flush();

    expect(description().value).toBe("A pothole outside my house.");
  });

  it("links to Google Maps for the citizen to check, with no key involved", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();

    const link = screen.getByRole("link", { name: /Check in Google Maps/ });

    expect(link.getAttribute("href")).toBe(
      "https://www.google.com/maps/search/?api=1&query=28.6315,77.2167",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("warns when a GPS fix is too loose to trust", async () => {
    gpsFix(CONNAUGHT_PLACE, 650);
    render(<RtiDraftingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();

    expect(screen.getByText(/only approximate/)).toBeTruthy();
  });

  it("does not warn about a good fix", async () => {
    gpsFix(CONNAUGHT_PLACE, 6);
    render(<RtiDraftingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();

    expect(screen.queryByText(/only approximate/)).toBeNull();
  });

  it("warns when the spot is clearly outside Delhi", async () => {
    gpsFix({ latitude: 19.076, longitude: 72.8777 }); // Mumbai
    render(<RtiDraftingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();

    expect(screen.getByText(/outside Delhi, so a Delhi department may not be responsible/)).toBeTruthy();
  });

  it("stays quiet about a spot in Delhi", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);

    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();

    expect(screen.queryByText(/outside Delhi/)).toBeNull();
  });
});

describe("continuing from the Describe step", () => {
  const continueButton = () => screen.getByRole("button", { name: "Continue" });

  it("does not count the location as a description of the problem", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();
    await waitForLookup();

    fireEvent.click(continueButton());
    await flush();

    expect(screen.getByText("Please describe your issue in at least 10 characters.")).toBeTruthy();
    expect(createCase).not.toHaveBeenCalled();
  });

  it("sends the description with the location line, so the backend sees where it is", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);
    type("The road outside my house has a deep pothole.");
    fireEvent.click(screen.getByRole("button", { name: /Use my current location/ }));
    await flush();
    await waitForLookup();

    fireEvent.click(continueButton());
    await flush();

    expect(createCase).toHaveBeenCalledWith(
      `The road outside my house has a deep pothole.\n\nLocation: ${ADDRESS} (28.63150, 77.21670)`,
    );
  });

  it("never sends the photo anywhere", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);
    type("The road outside my house has a deep pothole.");
    await choosePhoto();
    await waitForLookup();

    fireEvent.click(continueButton());
    await flush();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(createCase).mock.calls[0][0]).not.toMatch(/pothole\.jpg|blob:/);
  });

  it("keeps the photo and the spot when the citizen comes back to this step", async () => {
    gpsFix(CONNAUGHT_PLACE);
    render(<RtiDraftingWizard />);
    type("The road outside my house has a deep pothole.");
    await choosePhoto();
    await waitForLookup();
    fireEvent.click(continueButton());
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await flush();

    expect(screen.getByAltText("The photo you added")).toBeTruthy();
    expect(description().value).toContain(`Location: ${ADDRESS}`);
  });
});
