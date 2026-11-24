import { describe, expect, test } from "vitest";
import { COLLAGE, PHOTOS, SLIDES, type Photo } from "./photos";

const LICENSES = ["CC BY 2.0", "CC BY 3.0", "CC BY-SA 3.0", "CC BY-SA 4.0", "CC0", "GODL-India"];

describe("home page photos", () => {
  test.each(Object.entries(PHOTOS))("%s can be credited as its licence asks", (_name, photo: Photo) => {
    expect(photo.page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    expect(LICENSES).toContain(photo.license);
    expect(photo.licenseUrl).toMatch(/^https:\/\//);
    expect(photo.author.trim()).not.toBe("");
    expect(photo.title.trim()).not.toBe("");
    // Every photo is described for screen readers, even where the page shows it as decoration.
    expect(photo.alt.trim()).not.toBe("");
  });

  test("no photo appears twice in the slideshow and the collage", () => {
    const used = [...SLIDES.map((s) => s.photo.src), ...COLLAGE.map((c) => c.photo.src)];
    expect(new Set(used).size).toBe(used.length);
  });

  test("no two photos are the same file", () => {
    const sources = Object.values(PHOTOS).map((p) => p.src);
    expect(new Set(sources).size).toBe(sources.length);
  });
});
