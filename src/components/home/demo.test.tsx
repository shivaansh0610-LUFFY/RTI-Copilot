import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import DemoSheet from "./DemoSheet";
import { DEMO_COMPLAINT, DEMO_MS, DEMO_STEPS, SCENE_MS } from "./demo-script";
import { useDemo } from "./useDemo";

function Harness() {
  const demo = useDemo();
  return (
    <>
      <DemoSheet demo={demo} />
      <p data-testid="status">
        {demo.status} {demo.scene}
      </p>
    </>
  );
}

function status() {
  return screen.getByTestId("status").textContent;
}

function advance(ms: number) {
  // The clock moves in small ticks, as it would in a browser.
  for (let left = ms; left > 0; left -= 100) act(() => vi.advanceTimersByTime(Math.min(100, left)));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("the sheet waits for play, then plays the four steps in 30 seconds", () => {
  render(<Harness />);
  expect(status()).toBe("idle -1");
  advance(5000);
  expect(status()).toBe("idle -1");

  fireEvent.click(screen.getByRole("button", { name: "Play the 30-second demo of RTI Copilot" }));
  expect(status()).toBe("playing 0");
  // Focus moves to the pause button, as the play button has gone.
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pause the demo" }));

  advance(SCENE_MS);
  expect(status()).toBe("playing 1");
  advance(SCENE_MS * 2);
  expect(status()).toBe("playing 3");
  advance(SCENE_MS);
  expect(status()).toBe("done 3");
  expect(DEMO_MS).toBe(30000);
  expect(screen.queryByRole("button", { name: "Pause the demo" })).toBeNull();
});

test("the complaint types itself out in the first scene", () => {
  const { container } = render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /play the 30-second demo/i }));
  advance(1000);
  const typedSoFar = container.querySelector(".demo-field")?.textContent ?? "";
  expect(typedSoFar.length).toBeGreaterThan(0);
  expect(typedSoFar.length).toBeLessThan(DEMO_COMPLAINT.length);

  advance(4000);
  expect(container.querySelector(".demo-field")?.textContent).toBe(DEMO_COMPLAINT);
});

test("pause holds the demo where it is, and play carries on from there", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /play the 30-second demo/i }));
  advance(SCENE_MS + 1000);
  fireEvent.click(screen.getByRole("button", { name: "Pause the demo" }));
  advance(SCENE_MS * 3);
  expect(status()).toBe("paused 1");

  fireEvent.click(screen.getByRole("button", { name: "Play the demo" }));
  advance(SCENE_MS - 1000);
  expect(status()).toBe("playing 2");
});

test("a step can be picked from the bar, and the bar marks the current one", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /play the 30-second demo/i }));
  const reply = screen.getByRole("button", { name: `Go to step 4 of 4: ${DEMO_STEPS[3].title}` });
  fireEvent.click(reply);
  expect(status()).toBe("playing 3");
  expect(reply.getAttribute("aria-current")).toBe("step");
});

test("at the end it can be played again from the start, or closed", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /play the 30-second demo/i }));
  advance(DEMO_MS);

  const replay = screen.getByRole("button", { name: "Play the demo again" });
  expect(document.activeElement).toBe(replay);
  fireEvent.click(replay);
  expect(status()).toBe("playing 0");

  fireEvent.click(screen.getByRole("button", { name: "Close the demo" }));
  expect(status()).toBe("idle -1");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /play the 30-second demo/i }));
});

test("with reduced motion each scene shows complete at once", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
  const { container } = render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /play the 30-second demo/i }));
  expect(container.querySelector(".demo-field")?.textContent).toBe(DEMO_COMPLAINT);
});

test("the moving picture is hidden from screen readers", () => {
  const { container } = render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: /play the 30-second demo/i }));
  expect(container.querySelector(".demo-stage")?.getAttribute("aria-hidden")).toBe("true");
});
