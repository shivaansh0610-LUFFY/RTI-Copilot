import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { REPAIR_STARTER } from "./problems";
import { RECORDS } from "./records";
import RecordStrips from "./RecordStrips";

test("one record is open at a time, and opening another closes it", () => {
  render(<RecordStrips onStart={vi.fn()} />);
  const book = screen.getByRole("button", { name: /measurement book/i });
  const samples = screen.getByRole("button", { name: /samples/i });
  expect(book.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText(RECORDS[1].what)).toBeTruthy();

  fireEvent.click(samples);

  expect(samples.getAttribute("aria-expanded")).toBe("true");
  expect(book.getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByText(RECORDS[4].what)).toBeTruthy();
  expect(screen.queryByText(RECORDS[1].what)).toBeNull();
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(RECORDS.length);
});

test("the inspection link starts an RTI about a repair that broke again", () => {
  const onStart = vi.fn();
  render(<RecordStrips onStart={onStart} />);
  fireEvent.click(screen.getByRole("button", { name: /repair broke again\? start with an inspection/i }));
  expect(onStart).toHaveBeenCalledWith(REPAIR_STARTER);
});
