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

test("pausing stops it, and a slide can be picked by hand", () => {
  vi.useFakeTimers();
  renderHero();
  fireEvent.click(screen.getByRole("button", { name: "Pause the slideshow" }));
  act(() => vi.advanceTimersByTime(SLIDE_MS * 3));
  expect(screen.getByText(SLIDES[0].question)).toBeTruthy();

  const fourth = screen.getByRole("button", { name: new RegExp(`^Show slide 4 of ${SLIDES.length}`) });
  fireEvent.click(fourth);
  expect(screen.getByText(SLIDES[3].question)).toBeTruthy();
  expect(fourth.getAttribute("aria-current")).toBe("true");
  expect(screen.getByRole("button", { name: "Play the slideshow" })).toBeTruthy();
});

test("with reduced motion the slideshow starts paused", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
  renderHero();
  expect(screen.getByRole("button", { name: "Play the slideshow" })).toBeTruthy();
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
