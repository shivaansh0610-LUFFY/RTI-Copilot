import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import ProblemString from "./ProblemString";
import { PROBLEMS } from "./problems";

test("each problem has its polaroid, in the same order as the buttons below", () => {
  render(<ProblemString onStart={vi.fn()} />);
  const photos = screen.getAllByRole("figure").map((figure) => within(figure).getByRole("img").getAttribute("alt"));
  expect(photos).toEqual(PROBLEMS.map((p) => p.polaroid.photo.alt));

  const buttons = within(screen.getByRole("group", { name: "Pick one to start:" })).getAllByRole("button");
  expect(buttons.map((b) => b.textContent)).toEqual(PROBLEMS.map((p) => p.label));
});

test("a problem button starts an RTI with that problem's opening words", () => {
  const onStart = vi.fn();
  render(<ProblemString onStart={onStart} />);
  fireEvent.click(screen.getByRole("button", { name: PROBLEMS[4].label }));
  expect(onStart).toHaveBeenCalledWith(PROBLEMS[4].starter);
});
