import { describe, expect, it } from "vitest";
import {
  googleMapsUrl,
  isClearlyOutsideDelhi,
  locationLine,
  withLocationLine,
  type IssueLocation,
} from "./location";

const CONNAUGHT_PLACE: IssueLocation = { latitude: 28.6315, longitude: 77.2167 };
const LINE = "Location: MG Road, Karol Bagh, New Delhi (28.63150, 77.21670)";

describe("locationLine", () => {
  it("writes the address with the coordinates after it", () => {
    expect(locationLine({ ...CONNAUGHT_PLACE, address: "MG Road, Karol Bagh, New Delhi" })).toBe(LINE);
  });

  it("writes only the coordinates when there is no address", () => {
    expect(locationLine(CONNAUGHT_PLACE)).toBe("Location: 28.63150, 77.21670");
  });

  it("rounds to five decimals, about a metre", () => {
    expect(locationLine({ latitude: 28.123456789, longitude: 77.987654321 })).toBe(
      "Location: 28.12346, 77.98765",
    );
  });

  it("keeps the sign of negative coordinates", () => {
    expect(locationLine({ latitude: -33.8688, longitude: -70.5 })).toBe("Location: -33.86880, -70.50000");
  });
});

describe("withLocationLine", () => {
  it("adds the line after the description, separated by a blank line", () => {
    expect(withLocationLine("The road is broken.", LINE)).toBe(`The road is broken.\n\n${LINE}`);
  });

  it("adds only the line to an empty description", () => {
    expect(withLocationLine("", LINE)).toBe(LINE);
    expect(withLocationLine("  \n ", LINE)).toBe(LINE);
  });

  it("replaces its own line where it stands, leaving the rest alone", () => {
    const text = `A pothole.\n\nLocation: 28.63150, 77.21670\n\nIt has been there two years.`;

    expect(withLocationLine(text, LINE)).toBe(`A pothole.\n\n${LINE}\n\nIt has been there two years.`);
  });

  it("is a no-op when asked for the same line twice", () => {
    const once = withLocationLine("A pothole.", LINE);

    expect(withLocationLine(once, LINE)).toBe(once);
  });

  it("never touches a Location line the citizen typed themselves", () => {
    const mine = "A pothole.\nLocation: near the temple on Ring Road";

    const result = withLocationLine(mine, LINE);

    expect(result).toBe(`${mine}\n\n${LINE}`);
    expect(withLocationLine(result, undefined)).toBe(mine);
  });

  it("does not mistake a typed line that merely mentions numbers for its own", () => {
    const mine = "Location: house 12, lane 4, Ring Road";

    expect(withLocationLine(mine, undefined)).toBe(mine);
  });

  it("takes its line out, and the blank line before it", () => {
    expect(withLocationLine(`The road is broken.\n\n${LINE}`, undefined)).toBe("The road is broken.");
    expect(withLocationLine(LINE, undefined)).toBe("");
  });

  it("changes nothing when there is no line to take out", () => {
    expect(withLocationLine("The road is broken.  \n", undefined)).toBe("The road is broken.  \n");
  });

  it("replaces the last of its lines if more than one has crept in", () => {
    const text = `Location: 1.00000, 2.00000\nmiddle\nLocation: 3.00000, 4.00000`;

    expect(withLocationLine(text, LINE)).toBe(`Location: 1.00000, 2.00000\nmiddle\n${LINE}`);
  });

  it("round-trips: adding then removing gives back the description", () => {
    const description = "The road in front of my house has been broken for two years.";

    expect(withLocationLine(withLocationLine(description, LINE), undefined)).toBe(description);
  });
});

describe("isClearlyOutsideDelhi", () => {
  it.each([
    ["Connaught Place", 28.6315, 77.2167],
    ["Dwarka", 28.5921, 77.046],
    ["Narela", 28.8527, 77.0929],
  ])("%s is not outside", (_name, latitude, longitude) => {
    expect(isClearlyOutsideDelhi({ latitude, longitude })).toBe(false);
  });

  it.each([
    ["Mumbai", 19.076, 72.8777],
    ["Noida", 28.5355, 77.391],
    ["Sonipat", 28.9931, 77.0151],
    ["Jaipur", 26.9124, 75.7873],
  ])("%s is outside", (_name, latitude, longitude) => {
    expect(isClearlyOutsideDelhi({ latitude, longitude })).toBe(true);
  });

  it("makes no claim about the border towns inside its rough box", () => {
    // Gurugram is not in Delhi, but a box this rough can't say so. It must not claim "outside".
    expect(isClearlyOutsideDelhi({ latitude: 28.4595, longitude: 77.0266 })).toBe(false);
  });
});

describe("googleMapsUrl", () => {
  it("opens the exact spot with no API key", () => {
    expect(googleMapsUrl(CONNAUGHT_PLACE)).toBe(
      "https://www.google.com/maps/search/?api=1&query=28.6315,77.2167",
    );
  });
});
