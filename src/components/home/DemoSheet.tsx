import { Camera, Check, MapPin, Pause, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  DEMO_CHECKS,
  DEMO_COMPLAINT,
  DEMO_FINDINGS,
  DEMO_PLACE,
  DEMO_REQUESTS,
  DEMO_STEPS,
  SCENE_MS,
  TIMING,
} from "./demo-script";
import { prefersReducedMotion } from "./motion";
import type { Demo } from "./useDemo";
import "./demo.css";

// The application sheet in "How it works". At rest it shows the start of an RTI application
// with a play button; pressed, it plays the 30-second demo on the sheet itself.
// The moving picture is hidden from screen readers: the caption under the sheet says the same
// thing, a step at a time, and the steps listed below say it all at once.
export default function DemoSheet({ demo }: { demo: Demo }) {
  // With reduced motion each scene shows complete, with nothing typing or sliding in.
  const [reduced] = useState(prefersReducedMotion);
  const t = reduced ? SCENE_MS : demo.local;
  const active = demo.status !== "idle";

  const playRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  // The button that should have focus once the one just pressed has gone from the page.
  const focusNext = useRef<"play" | "toggle" | null>(null);

  useEffect(() => {
    const target = focusNext.current === "play" ? playRef : focusNext.current === "toggle" ? toggleRef : null;
    focusNext.current = null;
    target?.current?.focus();
  });

  // At the end the pause button goes away; if it had focus, hand it to the replay button.
  useEffect(() => {
    if (demo.status === "done" && (!document.activeElement || document.activeElement === document.body)) {
      replayRef.current?.focus();
    }
  }, [demo.status]);

  function start() {
    focusNext.current = "toggle";
    demo.play();
  }

  function close() {
    focusNext.current = "play";
    demo.close();
  }

  return (
    <div className={"sheet" + (active ? " is-active" : "") + (demo.status === "done" ? " is-done" : "")}>
      {!active && (
        <>
          <Letter />
          <button
            ref={playRef}
            type="button"
            onClick={start}
            aria-label="Play the 30-second demo of RTI Copilot"
            className="sheet-play"
          >
            <Play size={30} fill="currentColor" aria-hidden="true" />
          </button>
        </>
      )}

      {active && (
        <>
          <div className="demo-stage" aria-hidden="true">
            <p className="demo-chip">
              <span>{demo.scene + 1}</span> {DEMO_STEPS[demo.scene].title}
            </p>
            <div key={demo.scene} className="demo-scene">
              {demo.scene === 0 && <Describe t={t} />}
              {demo.scene === 1 && <Requests t={t} />}
              {demo.scene === 2 && <OfficerCheck t={t} />}
              {demo.scene === 3 && <Reply t={t} />}
            </div>
          </div>

          <div role="group" aria-label="Demo controls" className="demo-bar">
            {demo.status !== "done" && (
              <button
                ref={toggleRef}
                type="button"
                onClick={demo.status === "playing" ? demo.pause : demo.play}
                aria-label={demo.status === "playing" ? "Pause the demo" : "Play the demo"}
                className="demo-icon-btn"
              >
                {demo.status === "playing" ? (
                  <Pause size={15} fill="currentColor" aria-hidden="true" />
                ) : (
                  <Play size={15} fill="currentColor" aria-hidden="true" />
                )}
              </button>
            )}
            <div className="demo-segments">
              {DEMO_STEPS.map((step, i) => {
                const fill = Math.min(1, Math.max(0, (demo.elapsed - i * SCENE_MS) / SCENE_MS));
                return (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => demo.jump(i)}
                    aria-label={`Go to step ${i + 1} of ${DEMO_STEPS.length}: ${step.title}`}
                    aria-current={i === demo.scene ? "step" : undefined}
                    className="demo-segment"
                  >
                    <span style={{ transform: `scaleX(${fill})` }} />
                  </button>
                );
              })}
            </div>
            <span className="demo-time" aria-hidden="true">
              0:{String(Math.floor(demo.elapsed / 1000)).padStart(2, "0")}
            </span>
            <button type="button" onClick={close} aria-label="Close the demo" className="demo-icon-btn">
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {demo.status === "done" && (
            <button
              ref={replayRef}
              type="button"
              onClick={start}
              aria-label="Play the demo again"
              className="sheet-play sheet-replay"
            >
              <RotateCcw size={28} aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

// The sheet at rest: the top of an RTI application, as decoration.
function Letter() {
  return (
    <div className="sheet-letter" aria-hidden="true">
      <p>
        To
        <br />
        The Public Information Officer
        <br />
        Public Works Department, Delhi
      </p>
      <p className="sheet-letter-subject">
        Subject: Request for information under Section 6(1) of the RTI Act, 2005
      </p>
      <p>Please provide, for the period 1 January 2026 to the date of this application:</p>
      <p>1. A copy of the work order for the repair of this road carried out in March 2026.</p>
      <p>2. Copies of the Measurement Book entries recorded for that work.</p>
      <p>3. Copies of the bills paid to the contractor for that work.</p>
      <p>4. Under Section 2(j), an inspection of the work and certified samples of the material used.</p>
    </div>
  );
}

function shown(t: number, at: number) {
  return t >= at ? " is-shown" : "";
}

function Describe({ t }: { t: number }) {
  const typed = Math.max(0, Math.floor((t - TIMING.typeFrom) / TIMING.typeMsPerChar));
  const done = typed >= DEMO_COMPLAINT.length;
  return (
    <>
      <p className="demo-label">What&apos;s the problem?</p>
      <p className="demo-field">
        {DEMO_COMPLAINT.slice(0, typed)}
        {!done && <span className="demo-caret" />}
      </p>
      <div className="demo-attachments">
        <span className={"demo-pill" + shown(t, TIMING.photoAt)}>
          <Camera size={13} />
          Photo added
        </span>
        <span className={"demo-pill" + shown(t, TIMING.placeAt)}>
          <MapPin size={13} />
          {DEMO_PLACE}
        </span>
      </div>
      <p className={"demo-button" + shown(t, TIMING.photoAt) + (t >= TIMING.continueAt ? " is-pressed" : "")}>
        Continue
      </p>
    </>
  );
}

function Requests({ t }: { t: number }) {
  return (
    <>
      <p className="demo-letter-head">To the PIO, Public Works Department, Delhi</p>
      <p className="demo-letter-intro">Under Section 6(1) of the RTI Act, 2005, please provide:</p>
      <ol className="demo-requests">
        {DEMO_REQUESTS.map((request, i) => (
          <li key={request.text} className={"demo-reveal" + shown(t, TIMING.requestAt(i))}>
            <span className="demo-n">{i + 1}.</span>
            <span>
              {request.text}
              {request.cites && (
                <span className={"demo-cite" + shown(t, TIMING.requestAt(i) + TIMING.citeAfter)}>
                  cites {request.cites}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className={"demo-languages demo-reveal" + shown(t, TIMING.languageAt)}>
        <span className="is-on">English</span>
        <span lang="hi">हिंदी</span>
      </p>
    </>
  );
}

function OfficerCheck({ t }: { t: number }) {
  const ticked = DEMO_CHECKS.filter((_, i) => t >= TIMING.checkAt(i)).length;
  const score = t >= TIMING.moreChecksAt ? 10 : ticked;
  return (
    <>
      <p className="demo-label">Read like a reluctant PIO</p>
      <ul className="demo-checks">
        {DEMO_CHECKS.map((check, i) => (
          <li key={check} className={i < ticked ? "is-ticked" : ""}>
            <span className="demo-tick">
              <Check size={11} strokeWidth={3} />
            </span>
            {check}
          </li>
        ))}
        <li className={"demo-more demo-reveal" + shown(t, TIMING.moreChecksAt)}>+ 5 more checks, all passed</li>
      </ul>
      <div className="demo-score">
        <p>
          Score <strong>{score}</strong>/10
        </p>
        <p className={"demo-stamp" + shown(t, TIMING.stampAt)}>
          <span>PIO-PROOF</span>
          <span>10/10</span>
        </p>
      </div>
    </>
  );
}

function Reply({ t }: { t: number }) {
  return (
    <>
      <p className="demo-label">The PIO&apos;s reply, checked request by request</p>
      <ul className="demo-findings">
        {DEMO_FINDINGS.map((finding, i) => (
          <li key={finding.record} className={"demo-reveal" + shown(t, TIMING.findingAt(i))}>
            <span>
              {i + 1}. {finding.record}
            </span>
            <span className={"demo-badge is-" + finding.tone}>{finding.label}</span>
          </li>
        ))}
      </ul>
      <p
        className={
          "demo-button demo-appeal" + shown(t, TIMING.appealAt) + (t >= TIMING.appealPressAt ? " is-pressed" : "")
        }
      >
        Draft my first appeal
      </p>
      <p className={"demo-note demo-reveal" + shown(t, TIMING.appealAt)}>Section 19(1) · within 30 days of the reply</p>
    </>
  );
}

