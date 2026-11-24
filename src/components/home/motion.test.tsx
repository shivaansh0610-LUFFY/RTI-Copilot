import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { useScrollStory } from "./motion";

function Page() {
  const root = useRef<HTMLDivElement>(null);
  useScrollStory(root);
  return (
    <div ref={root} data-testid="root">
      <section data-reveal data-testid="first">First</section>
      <section data-reveal data-testid="second">Second</section>
    </div>
  );
}

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let observed: Element[] = [];
let fire: Callback = () => {};

class FakeObserver {
  constructor(callback: Callback) {
    fire = callback;
  }
  observe(target: Element) {
    observed.push(target);
  }
  unobserve(target: Element) {
    observed = observed.filter((t) => t !== target);
  }
  disconnect() {
    observed = [];
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  observed = [];
});

test("without an IntersectionObserver nothing is ever hidden", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const { getByTestId } = render(<Page />);
  expect(getByTestId("root").classList.contains("is-armed")).toBe(false);
});

test("sections are revealed as they scroll into view", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { getByTestId } = render(<Page />);
  const second = getByTestId("second");

  expect(getByTestId("root").classList.contains("is-armed")).toBe(true);
  expect(observed).toContain(second);
  expect(second.classList.contains("is-in")).toBe(false);

  fire([{ target: second, isIntersecting: true }]);
  expect(second.classList.contains("is-in")).toBe(true);
  expect(observed).not.toContain(second);
});

test("a section already on screen when the page loads stays shown", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const onScreen = { top: 10, bottom: 300, left: 0, right: 0, width: 0, height: 290, x: 0, y: 10 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return (this.dataset.testid === "first" ? onScreen : { ...onScreen, top: 2000, bottom: 2300 }) as DOMRect;
  });
  const { getByTestId } = render(<Page />);

  expect(getByTestId("first").classList.contains("is-in")).toBe(true);
  expect(observed).not.toContain(getByTestId("first"));
  expect(observed).toContain(getByTestId("second"));
});

test("people who ask for less motion get the page with no motion at all", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
  const { getByTestId } = render(<Page />);

  expect(getByTestId("root").classList.contains("is-armed")).toBe(false);
  expect(getByTestId("root").style.getPropertyValue("--progress")).toBe("");
});
