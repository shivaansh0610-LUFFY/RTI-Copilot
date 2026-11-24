import { expect, test } from "vitest";
import { diffLines, diffWords } from "./diff";

test("unchanged words stay, changed ones show as removed and added", () => {
  const parts = diffWords("1. Why was the road broken?", "1. Copy of the inspection report for the road");
  const removed = parts.filter((p) => p.kind === "removed").map((p) => p.text).join("");
  const added = parts.filter((p) => p.kind === "added").map((p) => p.text).join("");

  expect(removed).toContain("Why");
  expect(added).toContain("Copy");
  // Putting the same and added parts back together gives the new text exactly.
  expect(parts.filter((p) => p.kind !== "removed").map((p) => p.text).join("")).toBe(
    "1. Copy of the inspection report for the road",
  );
  expect(parts.filter((p) => p.kind !== "added").map((p) => p.text).join("")).toBe("1. Why was the road broken?");
});

test("identical texts are one unchanged part, and line breaks are kept", () => {
  expect(diffWords("a\nb c", "a\nb c")).toEqual([{ kind: "same", text: "a\nb c" }]);
});

test("lines: an unchanged line stays, a reworded one shows as old then new", () => {
  const before = "Opening line\n1. Why was the road broken?\n2. Copy of the work order";
  const after = "Opening line\n\n1. Copy of the inspection report\n2. Copy of the work order\nTransfer line";

  expect(diffLines(before, after)).toEqual([
    { kind: "same", text: "Opening line" },
    { kind: "removed", text: "1. Why was the road broken?" },
    { kind: "added", text: "1. Copy of the inspection report" },
    { kind: "same", text: "2. Copy of the work order" },
    { kind: "added", text: "Transfer line" },
  ]);
});
