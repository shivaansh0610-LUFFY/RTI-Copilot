import { ArrowRight } from "lucide-react";
import { Fragment } from "react";
import { COLLAGE, SLIDES, type Photo } from "./photos";
import { PROBLEMS } from "./problems";
import "./closing.css";

const CREDITS: { group: string; photos: Photo[] }[] = [
  { group: "Slideshow", photos: SLIDES.map((s) => s.photo) },
  { group: "Collage", photos: COLLAGE.map((c) => c.photo) },
  { group: "Polaroids", photos: PROBLEMS.map((p) => p.polaroid.photo) },
];

// The last chapter, "Ask. They must answer.", and the home page's footer: what RTI Copilot is
// and isn't, and a credit for every photo on the page.
export default function Closing({
  onStart,
  onAnalyse,
  onReview,
}: {
  onStart: () => void;
  onAnalyse: () => void;
  onReview?: () => void;
}) {
  return (
    <>
      <section aria-labelledby="closing-title" className="closing">
        <div data-reveal className="story-wrap closing-inner">
          <p className="closing-stamp">30 DAYS · SECTION 7(1)</p>
          <h2 id="closing-title" className="closing-title">
            Ask. <br />
            <span>They must answer.</span>
          </h2>
          <p className="closing-text">
            The PIO must reply within 30 days. RTI Copilot helps you ask so precisely that the
            reply has to be useful.
          </p>
          <div className="closing-actions">
            <button type="button" onClick={onStart} className="story-btn story-btn-ink">
              Start my RTI
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            {onReview && (
              <button type="button" onClick={onReview} className="story-btn story-btn-line">
                Check my draft
              </button>
            )}
            <button type="button" onClick={onAnalyse} className="story-btn story-btn-line">
              I got a reply
            </button>
          </div>
        </div>
      </section>

      <footer className="story-footer">
        <div className="story-wrap story-footer-inner">
          <div className="story-footer-top">
            <div className="story-footer-about">
              <p>
                RTI Copilot is an independent citizen tool. It is not a government website and is
                not run by PWD Delhi. It is an assistant, not legal advice: read every draft before
                you file it. You file it yourself; it never files on your behalf or asks for portal
                passwords.
              </p>
              <p>Your photo stays on your device; your description is sent to the AI service that writes the drafts.</p>
            </div>
            <p className="story-footer-name">RTI Copilot</p>
          </div>
          <p className="story-footer-credits">
            Photos via Wikimedia Commons, some cropped.{" "}
            {CREDITS.map(({ group, photos }) => (
              <Fragment key={group}>
                {group}:{" "}
                {photos.map((photo, i) => (
                  <Fragment key={photo.src}>
                    <a href={photo.page}>{photo.title}</a> by {photo.author} (
                    <a href={photo.licenseUrl}>{photo.license}</a>
                    {photo.changed ? `, ${photo.changed}` : ""})
                    {i < photos.length - 1 ? "; " : ". "}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </p>
          <p className="story-footer-law">
            For RTI applications to the Public Works Department, Government of NCT of Delhi, under
            the Right to Information Act, 2005.
          </p>
        </div>
      </footer>
    </>
  );
}
