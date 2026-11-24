import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import Closing from "./Closing";
import { PHOTOS } from "./photos";

test("the footer credits every photo on the page, linked to its page and licence", () => {
  render(<Closing onStart={vi.fn()} onAnalyse={vi.fn()} />);
  const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
  for (const photo of Object.values(PHOTOS)) {
    expect(links).toContain(photo.page);
    expect(links).toContain(photo.licenseUrl);
  }
  expect(screen.getByText(/toned blue/)).toBeTruthy();
});

test("the footer keeps the app's disclaimers", () => {
  render(<Closing onStart={vi.fn()} onAnalyse={vi.fn()} />);
  expect(screen.getByText(/not a government website/)).toBeTruthy();
  expect(screen.getByText(/Your photo stays on your device/)).toBeTruthy();
});

test("the closing buttons lead where they say", () => {
  const handlers = { onStart: vi.fn(), onAnalyse: vi.fn(), onReview: vi.fn() };
  render(<Closing {...handlers} />);
  fireEvent.click(screen.getByRole("button", { name: /start my rti/i }));
  fireEvent.click(screen.getByRole("button", { name: /check my draft/i }));
  fireEvent.click(screen.getByRole("button", { name: /i got a reply/i }));
  expect(handlers.onStart).toHaveBeenCalledOnce();
  expect(handlers.onReview).toHaveBeenCalledOnce();
  expect(handlers.onAnalyse).toHaveBeenCalledOnce();
});
