import { AlertTriangle, Check, CheckCircle2, Loader2, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { DraftReview, ReviewCheck } from "../../types";
import { PrimaryButton, SecondaryButton } from "../rti-drafting-wizard/ui";
import { reviewDraft, ReviewUnavailable } from "./api";
import { diffLines } from "./diff";

const VERDICT: Record<DraftReview["verdict"], { text: string; ring: string; tone: string }> = {
  ready: { text: "Ready to file: hard to refuse.", ring: "border-green-600 text-green-700", tone: "text-green-800" },
  fix: { text: "Fix a few things before you file.", ring: "border-amber-500 text-amber-700", tone: "text-amber-800" },
  weak: { text: "Easy to refuse as it stands.", ring: "border-red-500 text-red-700", tone: "text-red-800" },
};

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
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-slate-700" />
          <div>
            <h2 id="pio-review-heading" className="text-sm font-semibold text-slate-900">
              PIO review
            </h2>
            <p className="text-[13px] text-slate-600">
              See your application the way the officer will, before you file it.
            </p>
          </div>
        </div>
        <PrimaryButton type="button" onClick={check} disabled={checking || !text.trim()}>
          {checking ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          {checking ? "Reading it like a PIO..." : review ? "Check again" : "Check like a PIO"}
        </PrimaryButton>
      </div>

      {usedText === text && !review && (
        <p className="flex items-center gap-1.5 text-[13px] text-green-700">
          <Check size={14} />
          Using the improved version. Check again to see its score.
        </p>
      )}
      {isStale && usedText !== text && !checking && (
        <p className="text-[13px] text-slate-500">The text changed since the last review. Check again.</p>
      )}
      {error && <p className="text-[13px] text-red-600">{error}</p>}

      {review && <ReviewResult review={review} original={text} onUse={onUse ? use : undefined} />}
    </section>
  );
}

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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className={
            "flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-4 bg-white " + verdict.ring
          }
          aria-label={`Score ${review.score} out of ${review.outOf}`}
        >
          <span className="text-lg font-bold leading-none">{review.score}</span>
          <span className="text-[10px] text-slate-500">of {review.outOf}</span>
        </div>
        <div>
          <p className={"text-sm font-semibold " + verdict.tone}>{verdict.text}</p>
          <p className="text-xs text-slate-500">
            {review.score} of {review.outOf} fixed checks from the RTI Act passed.{" "}
            {review.aiUsed
              ? "The AI, playing the officer, read it too."
              : "The AI wasn't available this time, so there are no AI notes or suggested wording: try again in a minute."}
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        This is not a chance of getting a reply: the PIO must reply to every application within 30
        days (Section 7(1)). These checks decide whether the reply is useful.
      </p>

      {failed.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Problems found">
          {failed.map((check) => (
            <FailedCheck key={check.id} check={check} />
          ))}
        </ul>
      )}

      {passed.length > 0 && (
        <details className="rounded-md bg-slate-50 p-2 text-[13px] text-slate-700" open={failed.length === 0}>
          <summary className="cursor-pointer font-medium">
            {passed.length} {passed.length === 1 ? "check" : "checks"} passed
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {passed.map((check) => (
              <li key={check.id} className="flex items-start gap-1.5">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-600" />
                {check.label}
              </li>
            ))}
          </ul>
        </details>
      )}

      {aiNotes.length > 0 && (
        <div className="rounded-md border border-slate-200 p-3 text-[13px] text-slate-700">
          <p className="font-medium text-slate-900">The AI officer also noticed (not part of the score):</p>
          <ul className="mt-1 flex flex-col gap-1">
            {aiNotes.map((note, index) => (
              <li key={`${index}-${note.point}-${note.checkId}`} className="border-l-2 border-slate-300 pl-2 italic">
                Point {note.point}: &ldquo;{note.officerSays}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.improved && <Improved review={review} original={original} onUse={onUse} />}
      {!review.improved && (failed.length > 0 || aiNotes.length > 0) && review.aiUsed && (
        <p className="text-[13px] text-slate-500">
          No improved version this time: the AI's suggestion did not pass our safety checks (it has to
          keep every request, number and place, and add nothing of its own). Use the fixes above.
        </p>
      )}
    </div>
  );
}

function FailedCheck({ check }: { check: ReviewCheck }) {
  return (
    <li className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[13px] text-slate-800">
      <p className="flex items-start gap-1.5 font-medium text-amber-900">
        <XCircle size={15} className="mt-0.5 shrink-0" />
        <span>
          {check.label}
          {check.section && <span className="ml-1 font-normal text-amber-800">({check.section})</span>}
        </span>
      </p>
      {check.notes.map((note, index) => (
        <p key={`${index}-${note.point}`} className="mt-1.5 border-l-2 border-amber-300 pl-2 italic">
          Point {note.point}, the officer could reply: &ldquo;{note.officerSays}&rdquo;
        </p>
      ))}
      {check.why && <p className="mt-1.5 text-slate-700">{check.why}</p>}
      {check.fix && (
        <p className="mt-1 text-slate-700">
          <span className="font-medium">Fix:</span> {check.fix}
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
    <div className="flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
        <Sparkles size={15} />
        Improved version: {improved.score}/{review.outOf}
      </p>
      <p className="text-[13px] text-blue-900">
        {improved.fixed.length > 0
          ? `Fixes ${improved.fixed.length} ${improved.fixed.length === 1 ? "check" : "checks"}.`
          : "Rewords the points the AI officer noticed."}{" "}
        It keeps every request, number and place from yours, and adds no dates of its own. Read it
        before you use it.
      </p>
      {stillToDo.length > 0 && (
        <p className="flex items-start gap-1.5 text-[13px] text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Still for you to fix (only you know these): {stillToDo.map((check) => check.label.toLowerCase()).join("; ")}.
          </span>
        </p>
      )}
      <div className="flex gap-1" role="group" aria-label="How to show the improved version">
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
              "rounded-full border px-3 py-1 text-xs font-medium " +
              (showChanges === value ? "border-blue-900 bg-blue-900 text-white" : "border-blue-300 text-blue-900")
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-blue-100 bg-white p-3 text-sm leading-relaxed text-slate-800"
        data-testid="improved-text"
      >
        {showChanges
          ? diffLines(original, improved.text).map((part, index) =>
              part.kind === "same" ? (
                <div key={index} className="text-slate-600">
                  {part.text}
                </div>
              ) : part.kind === "added" ? (
                <ins key={index} className="my-0.5 block rounded bg-green-50 px-1 text-green-900 no-underline">
                  {part.text}
                </ins>
              ) : (
                <del key={index} className="my-0.5 block rounded bg-red-50 px-1 text-red-700">
                  {part.text}
                </del>
              ),
            )
          : improved.text}
      </div>
      {onUse && (
        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="button" onClick={() => onUse(improved.text)}>
            <Check size={14} />
            Use this version
          </PrimaryButton>
          <SecondaryButton type="button" onClick={() => navigator.clipboard?.writeText(improved.text)}>
            Copy it
          </SecondaryButton>
        </div>
      )}
    </div>
  );
}
