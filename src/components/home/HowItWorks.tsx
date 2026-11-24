import { useEffect, useRef } from "react";
import DemoSheet from "./DemoSheet";
import { DEMO_STEPS } from "./demo-script";
import { useDemo } from "./useDemo";
import "./how.css";

const STEPS: { title: string; text: string; badge?: string }[] = [
  {
    title: "Describe it",
    text: "In your own words, with a photo and your location.",
  },
  {
    title: "Ask precisely",
    text: "Requests for the exact records PWD must keep, citing the CPWD Works Manual, in English or Hindi.",
  },
  {
    title: "Pass the officer check",
    badge: "10/10",
    text: "Read like a reluctant PIO would read it, so you can fix every easy excuse to refuse.",
  },
  {
    title: "Check the reply",
    text: "Upload the PIO's reply: see what was answered, dodged or refused, and draft a first appeal.",
  },
];

// "03/ How it works": LET'S [the application sheet, which plays the demo] SEE IT, then the
// four steps, each lit up while the demo shows it.
export default function HowItWorks() {
  const demo = useDemo();
  const { status, scene, pause } = demo;
  const stageRef = useRef<HTMLDivElement>(null);

  // Scrolled away from, the demo pauses rather than playing to no one.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || status !== "playing" || typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) pause();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [status, pause]);

  const caption =
    status === "idle"
      ? "Press play for a 30-second walk through RTI Copilot, from a complaint to a first appeal."
      : status === "done"
        ? "That is the whole loop: describe, ask, check, and hold them to the reply."
        : `Step ${scene + 1} of ${DEMO_STEPS.length}. ${DEMO_STEPS[scene].caption}` +
          (status === "paused" ? " (Paused.)" : "");

  return (
    <section aria-labelledby="how-title" className="how-section">
      <div className="story-wrap how-inner">
        <p className="story-num">03/</p>
        <h2 id="how-title" className="story-title how-title">
          How it works
        </h2>

        <div ref={stageRef} data-reveal className="how-stage">
          <p aria-hidden="true" className="how-word">
            Let&apos;s
          </p>
          <DemoSheet demo={demo} />
          <p aria-hidden="true" className="how-word">
            See it
          </p>
        </div>
        <p aria-live="polite" className="how-caption">
          {caption}
        </p>

        <ol className="how-steps">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              aria-current={i === scene ? "step" : undefined}
              className={"how-step" + (i === scene ? " is-current" : "")}
            >
              <p className="how-step-n">{i + 1}</p>
              <p className="how-step-title">
                {step.title}
                {step.badge && <span className="how-step-badge">{step.badge}</span>}
              </p>
              <p className="how-step-text">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
