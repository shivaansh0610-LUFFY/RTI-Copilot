import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import ProblemString from "./ProblemString";
import { PROBLEMS } from "./problems";

test("each problem has its polaroid; the buttons to pick one are on the first step of the draft", () => {
  render(<ProblemString />);
  const photos = screen.getAllByRole("figure").map((figure) => within(figure).getByRole("img").getAttribute("alt"));
  expect(photos).toEqual(PROBLEMS.map((p) => p.polaroid.photo.alt));
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});
