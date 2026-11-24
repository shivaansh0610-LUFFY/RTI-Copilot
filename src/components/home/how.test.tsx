import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DEMO_STEPS, SCENE_MS } from "./demo-script";
import HowItWorks from "./HowItWorks";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function currentStep() {
  return screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step");
}

test("the step the demo is showing is lit up, and the caption says what it shows", () => {
  vi.useFakeTimers();
  render(<HowItWorks />);
  expect(screen.getByText(/press play for a 30-second walk through/i)).toBeTruthy();
  expect(currentStep()).toBeUndefined();

  fireEvent.click(screen.getByRole("button", { name: /play the 30-second demo/i }));
  expect(currentStep()?.textContent).toContain("Describe it");
  expect(screen.getByText(`Step 1 of 4. ${DEMO_STEPS[0].caption}`)).toBeTruthy();

  for (let i = 0; i < (SCENE_MS * 2) / 100; i++) act(() => vi.advanceTimersByTime(100));
  expect(currentStep()?.textContent).toContain("Pass the officer check");
  expect(screen.getByText(`Step 3 of 4. ${DEMO_STEPS[2].caption}`)).toBeTruthy();
});

test("the demo pauses when it is scrolled out of view", () => {
  let report: (entries: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof report) {
        report = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  render(<HowItWorks />);
  fireEvent.click(screen.getByRole("button", { name: /play the 30-second demo/i }));

  act(() => report([{ isIntersecting: false }]));

  expect(screen.getByRole("button", { name: "Play the demo" })).toBeTruthy();
  expect(screen.getByText(/\(Paused\.\)/)).toBeTruthy();
});
