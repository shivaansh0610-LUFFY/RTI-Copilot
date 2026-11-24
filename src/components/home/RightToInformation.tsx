import "./rti.css";

// The opening chapter: what RTI is, as a dictionary entry, with the law's own words.
export default function RightToInformation() {
  return (
    <section aria-labelledby="rti-title" className="rti">
      <div data-reveal className="story-wrap rti-inner">
        <p lang="hi" className="rti-hindi">
          सूचना का अधिकार
        </p>
        <h2 id="rti-title" className="rti-title">
          Right to <br />
          <span className="rti-title-stamped">
            Information
            <span aria-hidden="true" className="rti-stamp">
              RTI ACT · 2005
            </span>
          </span>
        </h2>

        <div className="rti-columns">
          <div className="rti-entry">
            <svg width="120" height="112" viewBox="0 0 120 112" fill="none" aria-hidden="true" className="rti-sketch">
              <ellipse cx="60" cy="18" rx="15" ry="10" />
              <path d="M51 26c2 8 2 15 0 24h18c-2-9-2-16 0-24" />
              <path d="M33 50h54l4 13H29z" />
              <path d="M29 63h62v8H29z" />
              <path d="M38 54l-3 7M46 54l-3 7M54 54l-3 7M62 54l-3 7M70 54l-3 7M78 54l-3 7M86 54l-2 5" />
              <path d="M10 102c30-4 70-6 100-8" />
              <rect x="34" y="80" width="52" height="18" rx="3" stroke="#B42318" transform="rotate(-5 60 89)" />
              <path d="M42 89h36" stroke="#B42318" transform="rotate(-5 60 89)" />
            </svg>
            <p className="rti-headword">
              <strong>RTI</strong> <span className="rti-muted">(noun)</span>{" "}
              <span className="rti-ipa">/ˌɑːr tiː ˈaɪ/</span>
            </p>
            <p className="rti-definition">
              Every citizen&apos;s right to ask a public authority for its records, and to get an
              answer within 30 days.
            </p>
            <p className="rti-source">Right to Information Act, 2005 · Sections 3 and 7(1)</p>
          </div>

          <div className="rti-why">
            <p className="story-hand rti-why-hand">A law, not a favour.</p>
            <p className="rti-why-text">
              Every road, drain and streetlight is paid for with public money, and the records
              behind it belong to the public. RTI Copilot helps you ask for exactly the right
              ones.
            </p>
            <p className="rti-muted rti-scroll">(Scroll down to read the story)</p>
          </div>

          <figure className="rti-quote">
            <svg width="150" height="116" viewBox="0 0 150 116" fill="none" aria-hidden="true" className="rti-sketch">
              <path d="M16 22h40l8 9h70v72H16z" />
              <path d="M34 30h88M38 26h78" />
              <path d="M10 42h130l-6 62H16z" />
              <path d="M75 42v62" />
              <path d="M68 66c4-7 10-7 14 0c-4 7-10 7-14 0z" />
              <path d="M75 66l-10 15M75 66l10 15" />
              <path d="M24 54h22M24 60h14" />
              <path d="M96 52l30 0M96 58l22 0" stroke="#B0893F" />
            </svg>
            <blockquote className="story-hand rti-quote-text">
              “All citizens shall have the right to information.”
            </blockquote>
            <figcaption className="story-hand rti-quote-source">Section 3</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
