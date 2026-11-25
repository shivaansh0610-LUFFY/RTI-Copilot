import type { CSSProperties } from "react";
import { PROBLEMS } from "./problems";
import "./polaroids.css";

// How each polaroid hangs from the string: its tilt, and how far down the sagging string its
// peg sits (the middle ones lowest).
const TILT = [-6, 4, -3, 5, -4, 3];
const DROP = [22, 49, 62, 62, 49, 22];

// "And more…": one polaroid per problem, pegged to a string. The same problems are offered as
// opening words on the first step of Draft your RTI.
export default function ProblemString() {
  return (
    <section aria-labelledby="more-title" className="more-section">
      <div className="story-wrap more-inner">
        <h2 id="more-title" className="story-title more-title">
          And more…
        </h2>
        <p className="story-hand more-hand">Every one of these has records behind it.</p>

        <div data-reveal className="polaroids">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true" className="polaroids-string">
            <path d="M0 10 Q500 130 1000 10" />
          </svg>
          <ul>
            {PROBLEMS.map(({ label, polaroid }, i) => (
              <li
                key={label}
                className="polaroid"
                style={
                  {
                    "--tilt": `${TILT[i % TILT.length]}deg`,
                    "--drop": `${DROP[i % DROP.length]}px`,
                    "--delay": `${i * 0.08}s`,
                  } as CSSProperties
                }
              >
                <span aria-hidden="true" className="polaroid-peg" />
                <figure>
                  <img
                    src={polaroid.photo.src}
                    alt={polaroid.photo.alt}
                    loading="lazy"
                    decoding="async"
                    style={{ objectPosition: polaroid.position }}
                  />
                  <figcaption className="story-hand">{polaroid.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
