import { useCallback, useEffect, useState } from "react";
import { DEMO_MS, DEMO_STEPS, SCENE_MS } from "./demo-script";

export type DemoStatus = "idle" | "playing" | "paused" | "done";

// How often the demo moves on while playing.
const TICK_MS = 50;
// The most one tick may move it on. A tab in the background ticks rarely; when it comes back,
// the demo carries on from where it was instead of jumping a scene.
const MAX_STEP_MS = 250;

export type Demo = {
  status: DemoStatus;
  // Milliseconds into the demo, 0 to DEMO_MS.
  elapsed: number;
  // The current scene, 0 to 3, or -1 before the demo starts.
  scene: number;
  // Milliseconds into the current scene.
  local: number;
  play: () => void;
  pause: () => void;
  jump: (scene: number) => void;
  close: () => void;
};

// The demo's clock. It only starts when someone presses play, and can be paused, jumped
// through by scene, replayed or closed.
export function useDemo(): Demo {
  const [state, setState] = useState<{ status: Exclude<DemoStatus, "done">; elapsed: number }>({
    status: "idle",
    elapsed: 0,
  });
  const finished = state.elapsed >= DEMO_MS;
  const ticking = state.status === "playing" && !finished;

  useEffect(() => {
    if (!ticking) return;
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const step = Math.min(MAX_STEP_MS, Math.max(0, now - last));
      last = now;
      setState((s) => ({ ...s, elapsed: Math.min(DEMO_MS, s.elapsed + step) }));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking]);

  const play = useCallback(
    () =>
      setState((s) => ({
        status: "playing",
        // From the start the first time and after the end; from where it was after a pause.
        elapsed: s.status === "idle" || s.elapsed >= DEMO_MS ? 0 : s.elapsed,
      })),
    [],
  );
  const pause = useCallback(() => setState((s) => (s.status === "playing" ? { ...s, status: "paused" } : s)), []);
  const jump = useCallback(
    (scene: number) =>
      setState({
        status: "playing",
        elapsed: Math.max(0, Math.min(DEMO_STEPS.length - 1, scene)) * SCENE_MS,
      }),
    [],
  );
  const close = useCallback(() => setState({ status: "idle", elapsed: 0 }), []);

  const status: DemoStatus = state.status !== "idle" && finished ? "done" : state.status;
  const scene =
    status === "idle" ? -1 : Math.min(DEMO_STEPS.length - 1, Math.floor(state.elapsed / SCENE_MS));
  const local = scene < 0 ? 0 : state.elapsed - scene * SCENE_MS;

  return { status, elapsed: state.elapsed, scene, local, play, pause, jump, close };
}
