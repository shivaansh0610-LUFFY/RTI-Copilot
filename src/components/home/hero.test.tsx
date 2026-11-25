import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import Hero, { SLIDE_MS } from "./Hero";
import { SLIDES } from "./photos";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderHero() {
  const handlers = { onStart: vi.fn(), onAnalyse: vi.fn(), onReview: vi.fn() };
  render(<Hero {...handlers} />);
  return handlers;
}

test("the slideshow moves on by itself, and each slide credits its photo", () => {
  vi.useFakeTimers();
  renderHero();
  expect(screen.getByText(SLIDES[0].question)).toBeTruthy();
  expect(screen.getByText(SLIDES[0].photo.author, { exact: false })).toBeTruthy();

  act(() => vi.advanceTimersByTime(SLIDE_MS));

  expect(screen.getByText(SLIDES[1].question)).toBeTruthy();
  expect(screen.getByRole("link", { name: SLIDES[1].photo.title }).getAttribute("href")).toBe(SLIDES[1].photo.page);
});

test("there are no slideshow controls; the slide holds while focus is on the hero", () => {
  vi.useFakeTimers();
  renderHero();
  expect(screen.queryByRole("group", { name: "Slideshow controls" })).toBeNull();
  expect(screen.queryByRole("button", { name: /slideshow|show slide/i })).toBeNull();

  const start = screen.getByRole("button", { name: /start my rti/i });
  act(() => start.focus());
  act(() => vi.advanceTimersByTime(SLIDE_MS * 3));
  expect(screen.getByText(SLIDES[0].question)).toBeTruthy();

  act(() => start.blur());
  act(() => vi.advanceTimersByTime(SLIDE_MS));
  expect(screen.getByText(SLIDES[1].question)).toBeTruthy();
});

test("with reduced motion the photo stays still", () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
  renderHero();
  act(() => vi.advanceTimersByTime(SLIDE_MS * 3));
  expect(screen.getByText(SLIDES[0].question)).toBeTruthy();
});

test("the three buttons lead where they say", () => {
  const { onStart, onAnalyse, onReview } = renderHero();
  expect(screen.getByRole("heading", { level: 1, name: "Complaint ignored? Make them answer." })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /start my rti/i }));
  fireEvent.click(screen.getByRole("button", { name: /check my draft/i }));
  fireEvent.click(screen.getByRole("button", { name: /i got a reply/i }));
  expect(onStart).toHaveBeenCalledOnce();
  expect(onReview).toHaveBeenCalledOnce();
  expect(onAnalyse).toHaveBeenCalledOnce();
});

test("the example file is no longer on top of the photo", () => {
  renderHero();
  expect(screen.queryByText(/example file/i)).toBeNull();
});

test("the hero says it is not a government website, before anyone scrolls", () => {
  renderHero();
  expect(screen.getByText(/Not a government website, and not run by PWD Delhi/)).toBeTruthy();
});
