import { AlertTriangle, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { DraftReview, ReviewCheck } from "../../types";
import { Stamp } from "../layout/Paper";
import { PrimaryButton, SecondaryButton } from "../rti-drafting-wizard/ui";
import { reviewDraft, ReviewUnavailable } from "./api";
import { diffLines } from "./diff";

const VERDICT: Record<DraftReview["verdict"], { text: string; tone: string }> = {
  ready: { text: "Ready to file: hard to refuse.", tone: "text-leaf" },
  fix: { text: "Fix a few things before you file.", tone: "text-[#8a4b08]" },
  weak: { text: "Easy to refuse as it stands.", tone: "text-stamp" },
};

// The green button that takes a suggested fix, here and in the officer check.
const USE_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-leaf px-5 text-[15px] font-semibold text-white transition-colors hover:bg-[#0f5a2d]";

// Reads an application the way a Public Information Officer would and scores it out of 10
// (POST /review-draft). Shown under the draft, and on its own page for pasted applications.
// The review belongs to the text it was made for: change the text and it asks to check again.
// `onReview` hears the review of the current text, or undefined (none yet, or the text changed).
export default function PioReview({
  text,
  onUse,
  onReview,
}: {
  text: string;
  onUse?: (text: string) => void;
  onReview?: (review: DraftReview | undefined) => void;
}) {
  const [result, setResult] = useState<{ text: string; review: DraftReview } | undefined>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [usedText, setUsedText] = useState<string | undefined>();

  const review = result && result.text === text ? result.review : undefined;
  const isStale = result !== undefined && result.text !== text;

  useEffect(() => {
    onReview?.(review);
  }, [review, onReview]);

  function check() {
    setChecking(true);
    setError("");
    const checked = text;
    reviewDraft(checked)
      .then((next) => setResult({ text: checked, review: next }))
      .catch((reason) =>
        setError(
          reason instanceof ReviewUnavailable
            ? "The PIO review needs the RTI Copilot server, which this demo is running without."
            : "We couldn't run the PIO review. Please try again.",
        ),
      )
      .finally(() => setChecking(false));
  }

  function use(improved: string) {
    setUsedText(improved);
    onUse?.(improved);
  }

  return (
    <section
      aria-labelledby="pio-review-heading"
      className="flex flex-col gap-4 rounded-lg border border-edge bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pio-review-heading" className="font-title text-[26px] font-bold uppercase leading-none text-ink">
            PIO review
          </h2>
          <p className="mt-1.5 text-[14px] text-ink-3">
            See your application the way the officer will, before you file it.
          </p>
        </div>
        <PrimaryButton type="button" onClick={check} disabled={checking || !text.trim()}>
          {checking ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {checking ? "Reading it like a PIO..." : review ? "Check again" : "Check like a PIO"}
        </PrimaryButton>
      </div>

      {usedText === text && !review && (
        <p className="flex items-center gap-1.5 text-[14px] font-medium text-leaf">
          <Check size={16} />
          Using the improved version. Check again to see its score.
        </p>
      )}
      {isStale && usedText !== text && !checking && (
        <p className="text-[14px] text-muted">The text changed since the last review. Check again.</p>
      )}
      {error && <p className="text-[14px] font-medium text-stamp">{error}</p>}

      {review && <ReviewResult review={review} original={text} onUse={onUse ? use : undefined} />}
    </section>
  );
}

// The score comes down as a rubber stamp; what failed is written up in red pen.
function ReviewResult({
  review,
  original,
  onUse,
}: {
  review: DraftReview;
  original: string;
  onUse?: (text: string) => void;
}) {
  const verdict = VERDICT[review.verdict];
  const failed = review.checks.filter((check) => !check.passed);
  const passed = review.checks.filter((check) => check.passed);
  const aiNotes = review.aiNotes ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-5 border-t border-rule pt-5 sm:gap-7">
        <Stamp
          large
          top="SCORE"
          main={`${review.score}/${review.outOf}`}
          label={`Score ${review.score} out of ${review.outOf}`}
          className="ml-1"
        />
        <div>
          <p className={"font-title text-[24px] font-bold uppercase leading-[0.95] sm:text-[28px] " + verdict.tone}>
            {verdict.text}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">
            {review.score} of {review.outOf} fixed checks from the RTI Act passed.{" "}
            {review.aiUsed
              ? "The AI, playing the officer, read it too."
              : "The AI wasn't available this time, so there are no AI notes or suggested wording: try again in a minute."}
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        This is not a chance of getting a reply: the PIO must reply to every application within 30
        days (Section 7(1)). These checks decide whether the reply is useful.
      </p>

      {failed.length > 0 && (
        <ul className="flex flex-col gap-4" aria-label="Problems found">
          {failed.map((check) => (
            <FailedCheck key={check.id} check={check} />
          ))}
        </ul>
      )}

      {passed.length > 0 && (
        <details className="rounded-md bg-paper-light px-4 py-3 text-[14px] text-ink-2" open={failed.length === 0}>
          <summary className="cursor-pointer font-semibold">
            {passed.length} {passed.length === 1 ? "check" : "checks"} passed
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {passed.map((check) => (
              <li key={check.id} className="flex items-start gap-2">
                <Check size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-leaf" />
                {check.label}
              </li>
            ))}
          </ul>
        </details>
      )}

      {aiNotes.length > 0 && (
        <div className="border-l-2 border-stamp/35 pl-4">
          <p className="text-[14px] font-semibold text-ink">The AI officer also noticed (not part of the score):</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {aiNotes.map((note, index) => (
              <li key={`${index}-${note.point}-${note.checkId}`} className="pen text-[17px] leading-snug">
                Point {note.point}: &ldquo;{note.officerSays}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.improved && <Improved review={review} original={original} onUse={onUse} />}
      {!review.improved && (failed.length > 0 || aiNotes.length > 0) && review.aiUsed && (
        <p className="text-[14px] text-muted">
          No improved version this time: the AI's suggestion did not pass our safety checks (it has to
          keep every request, number and place, and add nothing of its own). Use the fixes above.
        </p>
      )}
    </div>
  );
}

// A failed check as the officer's note in the margin: the check, then in red pen what the
// officer could reply, then why and how to fix it.
function FailedCheck({ check }: { check: ReviewCheck }) {
  return (
    <li className="border-l-2 border-stamp/35 pl-4 text-[14px] text-ink-2">
      <p className="flex items-start gap-1.5 font-semibold text-stamp">
        <X size={17} strokeWidth={3} className="mt-0.5 shrink-0" />
        <span>
          {check.label}
          {check.section && <span className="ml-1 font-normal">({check.section})</span>}
        </span>
      </p>
      {check.notes.map((note, index) => (
        <p key={`${index}-${note.point}`} className="pen mt-1.5 text-[17px] leading-snug">
          Point {note.point}, the officer could reply: &ldquo;{note.officerSays}&rdquo;
        </p>
      ))}
      {check.why && <p className="mt-1.5 leading-relaxed">{check.why}</p>}
      {check.fix && (
        <p className="mt-1 leading-relaxed">
          <span className="font-semibold text-ink">Fix:</span> {check.fix}
        </p>
      )}
    </li>
  );
}

function Improved({
  review,
  original,
  onUse,
}: {
  review: DraftReview;
  original: string;
  onUse?: (text: string) => void;
}) {
  const improved = review.improved!;
  const [showChanges, setShowChanges] = useState(true);
  const stillToDo = review.checks.filter((check) => !check.passed && !improved.fixed.includes(check.id));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[#9fd5ae] bg-leaf-wash p-4 sm:p-5">
      <p className="font-title text-2xl font-bold uppercase leading-none text-leaf">
        Improved version: {improved.score}/{review.outOf}
      </p>
      <p className="text-[14px] leading-relaxed text-ink-2">
        {improved.fixed.length > 0
          ? `Fixes ${improved.fixed.length} ${improved.fixed.length === 1 ? "check" : "checks"}.`
          : "Rewords the points the AI officer noticed."}{" "}
        It keeps every request, number and place from yours, and adds no dates of its own. Read it
        before you use it.
      </p>
      {stillToDo.length > 0 && (
        <p className="flex items-start gap-1.5 text-[14px] text-[#7a4508]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Still for you to fix (only you know these): {stillToDo.map((check) => check.label.toLowerCase()).join("; ")}.
          </span>
        </p>
      )}
      <div
        className="inline-flex self-start rounded-full border border-[#9fd5ae] bg-white p-[3px]"
        role="group"
        aria-label="How to show the improved version"
      >
        {[
          { value: true, label: "Show changes" },
          { value: false, label: "Clean text" },
        ].map(({ value, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={showChanges === value}
            onClick={() => setShowChanges(value)}
            className={
              "min-h-9 rounded-full px-4 text-sm font-medium transition-colors " +
              (showChanges === value ? "bg-leaf text-white" : "text-leaf hover:bg-[#e6f6ec]")
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-[#cfe9d6] bg-white p-4 font-serif text-[14px] leading-[1.7] text-ink"
        data-testid="improved-text"
      >
        {showChanges
          ? diffLines(original, improved.text).map((part, index) =>
              part.kind === "same" ? (
                <div key={index} className="text-ink-3">
                  {part.text}
                </div>
              ) : part.kind === "added" ? (
                <ins key={index} className="my-0.5 block rounded bg-[#e6f6ec] px-1 text-leaf no-underline">
                  {part.text}
                </ins>
              ) : (
                <del key={index} className="my-0.5 block rounded bg-[#fdecea] px-1 text-stamp">
                  {part.text}
                </del>
              ),
            )
          : improved.text}
      </div>
      {onUse && (
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={() => onUse(improved.text)} className={USE_BUTTON}>
            <Check size={16} />
            Use this version
          </button>
          <SecondaryButton type="button" onClick={() => navigator.clipboard?.writeText(improved.text)}>
            Copy it
          </SecondaryButton>
        </div>
      )}
    </div>
  );
}
