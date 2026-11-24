import type { CSSProperties } from "react";
import { COLLAGE } from "./photos";
import "./collage.css";

// "01/ The problem": what a citizen lives with, as photos that slide past each other while
// the collage scrolls through the window (motion.ts sets --drift on the collage).
export default function ProblemCollage() {
  return (
    <section aria-labelledby="problem-title" className="collage-section">
      <div className="story-wrap collage-layout">
        <div className="collage-intro">
          <p className="story-num">01/</p>
          <h2 id="problem-title" className="story-title collage-title">
            The problem
          </h2>
          <p className="collage-text">
            A broken road costs time, money and safety. You complain, get a ticket number, and
            then nothing happens.
          </p>
          <p className="story-hand collage-hand">Sound familiar?</p>
        </div>
        <div data-reveal className="collage-reveal">
          <div data-drift className="collage">
            {COLLAGE.map(({ photo, position, box, drift }) => (
              <img
                key={photo.src}
                src={photo.src}
                alt={photo.alt}
                loading="lazy"
                decoding="async"
                className="collage-photo"
                style={{ ...box, objectPosition: position, "--shift": `${drift}px` } as CSSProperties}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
