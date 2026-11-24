import { ArrowRight, Pause, Play, Scale, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { prefersReducedMotion } from "./motion";
import { SLIDES } from "./photos";
import "./hero.css";

// How long each slide stays, in milliseconds.
export const SLIDE_MS = 6500;

// The darkening behind the hero text: a little at the top for the note card, most at the bottom
// left where the headline sits. Sized so the headline keeps at least 6:1 contrast on every
// photo, even on a phone.
const SHADE =
  "linear-gradient(180deg, rgba(10, 16, 32, 0.15) 0%, rgba(10, 16, 32, 0) 16%, rgba(10, 16, 32, 0) 24%, " +
  "rgba(10, 16, 32, 0.5) 40%, rgba(10, 16, 32, 0.72) 65%, rgba(10, 16, 32, 0.86) 100%), " +
  "linear-gradient(90deg, rgba(10, 16, 32, 0.45) 0%, rgba(10, 16, 32, 0) 60%)";

export default function Hero({
  onStart,
  onAnalyse,
  onReview,
}: {
  onStart: () => void;
  onAnalyse: () => void;
  onReview?: () => void;
}) {
  const [index, setIndex] = useState(0);
  // The slide fading out stays visible underneath the new one until the fade ends.
  const [previous, setPrevious] = useState(-1);
  // People who ask their system for less motion get a still photo; the controls still work.
  const [reduced] = useState(prefersReducedMotion);
  const [paused, setPaused] = useState(reduced);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setZoomed(true), 60);
    return () => window.clearTimeout(id);
  }, []);

  // A timeout per slide, so picking a slide by hand also restarts its full time on screen.
  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(() => {
      setPrevious(index);
      setIndex((index + 1) % SLIDES.length);
    }, SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [index, paused]);

  function goTo(n: number) {
    if (n === index) return;
    setPrevious(index);
    setIndex(n);
  }

  const slide = SLIDES[index];
  const zoom = zoomed && !reduced ? 1.08 : 1;

  return (
    <section aria-labelledby="hero-title" className="story-wrap hero">
      <div className="hero-panel">
        {SLIDES.map((s, k) => {
          const shown = k === index || k === previous;
          return (
            <img
              key={s.photo.src}
              src={s.photo.src}
              alt=""
              decoding="async"
              fetchPriority={k === 0 ? "high" : "low"}
              className="hero-photo"
              style={{
                objectPosition: s.position,
                opacity: shown ? 1 : 0,
                transform: `scale(${shown ? zoom : 1})`,
                zIndex: k === index ? 2 : k === previous ? 1 : 0,
              }}
            />
          );
        })}
        <div className="hero-shade" style={{ background: SHADE }} />

        <div className="hero-top">
          {/* Read out only when the slideshow is paused, so it never talks over the page. */}
          <div className="hero-note" aria-live={paused ? "polite" : "off"}>
            <p className="hero-note-question">{slide.question}</p>
            <p className="hero-note-ask">
              <span>Ask for:</span> {slide.ask}
            </p>
          </div>
          <div role="group" aria-label="Slideshow controls" className="hero-controls">
            {SLIDES.map((s, k) => (
              <button
                key={s.photo.src}
                type="button"
                aria-label={`Show slide ${k + 1} of ${SLIDES.length}: ${s.question}`}
                aria-current={k === index ? "true" : "false"}
                onClick={() => goTo(k)}
                className="hero-dot"
              >
                <span />
              </button>
            ))}
            <button
              type="button"
              aria-label={paused ? "Play the slideshow" : "Pause the slideshow"}
              onClick={() => setPaused((p) => !p)}
              className="hero-pause"
            >
              {paused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
            </button>
          </div>
        </div>

        <div className="hero-text">
          <p className="hero-eyebrow">Every road, drain and bridge is built with public money</p>
          <h1 id="hero-title" className="hero-title">
            Complaint ignored? <br />
            <span>Make them answer.</span>
          </h1>
          <p className="hero-lede">
            RTI Copilot turns a civic problem into an RTI application that asks for the exact
            records PWD must keep, reads the reply you get back, and drafts your appeal if it falls
            short. You file it yourself.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={() => onStart()} className="hero-btn hero-btn-primary">
              Start my RTI
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            {onReview && (
              <button type="button" onClick={() => onReview()} className="hero-btn hero-btn-ghost">
                <ShieldCheck size={18} aria-hidden="true" />
                Check my draft
              </button>
            )}
            <button type="button" onClick={() => onAnalyse()} className="hero-btn hero-btn-ghost">
              <Scale size={18} aria-hidden="true" />I got a reply
            </button>
          </div>
          <p className="hero-independent">
            An independent citizen tool. Not a government website, and not run by PWD Delhi.
          </p>
        </div>
      </div>

      <div className="hero-below">
        <dl className="hero-facts">
          <div>
            <dt>official documents it reads, from the RTI Act to the CPWD Works Manual</dt>
            <dd>8</dd>
          </div>
          <div>
            <dt>passages it can cite, word for word, in your application</dt>
            <dd>4,789</dd>
          </div>
          <div>
            <dt>for the PIO to reply, by law: Section 7(1) of the RTI Act</dt>
            <dd>30 days</dd>
          </div>
        </dl>
        <p className="hero-credit">
          Photo: <a href={slide.photo.page}>{slide.photo.title}</a> by {slide.photo.author},{" "}
          <a href={slide.photo.licenseUrl}>{slide.photo.license}</a>, via Wikimedia Commons.
        </p>
      </div>
    </section>
  );
}
