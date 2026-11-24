import { useEffect, type RefObject } from "react";

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

// The home page's scroll motion, all optional: the page reads the same without any of it.
// - Elements marked data-reveal get the class "is-in" when they first scroll into view. The CSS
//   only hides them beforehand once the root has "is-armed", so nothing is ever hidden for good
//   (no IntersectionObserver, reduced motion, or a test environment: the content just shows).
// - The root's --progress (0 to 1) is how far the page has been read, for the line at the top.
// - Each [data-drift] element's --drift (-0.5 to 0.5) is how far it has travelled through the
//   window, for the collage photos to slide against each other.
// Values go straight to CSS variables, so scrolling never re-renders React.
export function useScrollStory(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return;
    const vh = () => window.innerHeight || 800;

    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-in");
            io?.unobserve(entry.target);
          }
        },
        { threshold: 0.12 },
      );
      el.querySelectorAll("[data-reveal]").forEach((target) => {
        // Whatever is on screen already stays shown: arming must never make it blink out.
        const r = target.getBoundingClientRect();
        if (r.top < vh() && r.bottom > 0) target.classList.add("is-in");
        else io?.observe(target);
      });
      el.classList.add("is-armed");
    }

    let frame = 0;
    function measure() {
      frame = 0;
      if (!el) return;
      const height = vh();
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - height);
      const progress = Math.min(1, Math.max(0, (window.scrollY || doc.scrollTop) / max));
      el.style.setProperty("--progress", progress.toFixed(4));
      el.querySelectorAll<HTMLElement>("[data-drift]").forEach((target) => {
        const r = target.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (height - r.top) / (height + r.height)));
        target.style.setProperty("--drift", (0.5 - p).toFixed(4));
      });
    }
    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      io?.disconnect();
      el.classList.remove("is-armed");
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [root]);
}
