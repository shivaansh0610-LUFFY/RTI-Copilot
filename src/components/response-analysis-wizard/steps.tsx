import { AlertTriangle, Check, Copy, FilePlus2, FileUp, Loader2, Printer, Scale } from "lucide-react";
import { printText } from "../../print";
import { useState } from "react";
import type {
  AppealItem,
  ClassificationLabel,
  ClassificationResult,
  FollowUpContext,
  InformationRequest,
  ResponsePassage,
} from "../../types";
import { Sheet } from "../layout/Paper";
import { FOLLOW_UP_LABELS, LABEL_TEXT, LABEL_TONE, NEXT_STEP_HINT, type LabelTone } from "./constants";
import { PrimaryButton, SecondaryButton } from "./ui";

const BADGE: Record<LabelTone, string> = {
  good: "bg-[#e6f6ec] text-leaf",
  part: "bg-[#fff1d6] text-[#8a4b08]",
  bad: "bg-[#fdecea] text-stamp",
  info: "bg-paper-warm text-ink-3",
};

// The numbered circle that ties a finding to its mark on the reply.
const TAG: Record<LabelTone, string> = {
  good: "bg-[#1e8a4c]",
  part: "bg-[#9a6114]",
  bad: "bg-stamp",
  info: "bg-muted",
};

const BAR: Record<LabelTone, string> = {
  good: "bg-[#1e8a4c]",
  part: "bg-[#d39a2c]",
  bad: "bg-stamp",
  info: "bg-faint",
};

function Tag({ n, tone }: { n: number; tone: LabelTone }) {
  return (
    <span
      className={
        "inline-grid h-[21px] w-[21px] shrink-0 place-items-center rounded-full align-[2px] font-mono text-[11.5px] font-semibold text-white " +
        TAG[tone]
      }
    >
      {n}
    </span>
  );
}

function PassageRef({ passage }: { passage: ResponsePassage }) {
  return (
    <span className="font-mono text-[11.5px] text-muted">
      p.{passage.page} &para;{passage.paragraph}
    </span>
  );
}

export function UploadStep({
  file,
  onFileSelect,
  onProcess,
  isProcessing,
  processingError,
  ingestResult,
  questions,
  onQuestionsChange,
}: {
  // Shown only for a reply to an RTI not drafted here: what the citizen asked, optional.
  questions?: string;
  onQuestionsChange?: (questions: string) => void;
  file: File | null;
  onFileSelect: (file: File | null) => void;
  onProcess: () => void;
  isProcessing: boolean;
  processingError: string;
  ingestResult: { pages: number; passages: ResponsePassage[]; ocrUsed: boolean } | null;
}) {
  const processingFailed = Boolean(processingError);
  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor="response-file"
        className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-edge-strong bg-card px-6 py-12 text-center transition-colors hover:border-ink-3"
      >
        <FileUp size={28} className="text-brown" />
        <span className="font-serif text-[17px] font-semibold text-ink">
          {file ? file.name : "Click to select a file, or drop it here"}
        </span>
        <span className="text-[13px] text-muted">The PIO&apos;s reply, as a .pdf or .txt</span>
        <input
          id="response-file"
          type="file"
          accept=".pdf,.txt"
          className="hidden"
          onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
        />
      </label>

      {questions !== undefined && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reply-questions" className="font-serif text-[17px] font-semibold text-ink">
            What did you ask? <span className="font-sans text-sm font-normal text-muted">(optional)</span>
          </label>
          <p className="text-[13.5px] leading-relaxed text-muted">
            Paste the questions from your RTI application, one per line, and each is checked against the
            reply. Leave it empty and we read the points the reply itself answers.
          </p>
          <textarea
            id="reply-questions"
            value={questions}
            onChange={(e) => onQuestionsChange?.(e.target.value)}
            rows={4}
            maxLength={5000}
            disabled={Boolean(ingestResult)}
            placeholder={"e.g. 1. Copy of the work order for the repair of Ring Road\n2. Copies of the Measurement Book entries"}
            className="rounded-lg border border-edge-strong bg-white px-4 py-3 font-serif text-[15px] leading-relaxed text-ink"
          />
        </div>
      )}

      {processingFailed && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[#f2b8b0] bg-[#fff7f5] p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-stamp" />
          <div>
            <p className="text-sm font-semibold text-stamp">Processing failed</p>
            <p className="text-[14px] text-ink-2">{processingError}</p>
          </div>
        </div>
      )}

      {ingestResult && !processingFailed && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[#9fd5ae] bg-leaf-wash p-4">
          <Check size={18} strokeWidth={3} className="mt-0.5 shrink-0 text-leaf" />
          <div>
            <p className="text-sm font-semibold text-leaf">Response processed</p>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {ingestResult.pages} page{ingestResult.pages === 1 ? "" : "s"} &middot;{" "}
              {ingestResult.passages.length} passages extracted &middot; OCR used:{" "}
              {ingestResult.ocrUsed ? "Yes" : "No"}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">
          The reply is read on the server to analyse it, and is not stored.
        </p>

        {processingFailed ? (
          <SecondaryButton onClick={onProcess} disabled={isProcessing}>
            {isProcessing && <Loader2 size={16} className="animate-spin" />}
            Retry
          </SecondaryButton>
        ) : (
          <PrimaryButton onClick={onProcess} disabled={!file || isProcessing || Boolean(ingestResult)}>
            {isProcessing && <Loader2 size={16} className="animate-spin" />}
            Process response
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}

function Quote({ passage }: { passage: ResponsePassage }) {
  return (
    <blockquote className="border-l-2 border-khaki pl-3 font-serif text-[14.5px] leading-relaxed text-ink-2">
      &ldquo;{passage.text}&rdquo;
      <span className="mt-0.5 block">
        <PassageRef passage={passage} />
      </span>
    </blockquote>
  );
}

// Each request beside the lines of the reply it was matched to, as rows of a ruled sheet.
export function AlignStep({
  requests,
  alignment,
  passages,
}: {
  requests: InformationRequest[];
  alignment: Record<string, ResponsePassage[]>;
  passages: ResponsePassage[];
}) {
  const [showExtractedText, setShowExtractedText] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      {passages.length > 0 && (
        <div className="max-w-3xl">
          <button
            type="button"
            onClick={() => setShowExtractedText((shown) => !shown)}
            className="py-1 text-[15px] font-semibold text-ink-blue underline underline-offset-4"
          >
            {showExtractedText ? "Hide" : "View"} the text read from your file ({passages.length} passages)
          </button>
          <p className="mt-1 text-[13px] text-muted">
            Check this against the original if a match below looks wrong -- a scan OCR misread would
            show up here first.
          </p>
          {showExtractedText && (
            <div className="mt-3 flex max-h-96 flex-col gap-3 overflow-y-auto rounded-lg border border-edge bg-white p-4">
              {passages.map((passage) => (
                <Quote key={passage.id} passage={passage} />
              ))}
            </div>
          )}
        </div>
      )}

      <ol aria-label="Your requests and the lines of the reply matched to them" className="paper-sheet">
        <li aria-hidden="true" className="hidden border-b-2 border-ink lg:grid lg:grid-cols-2">
          <span className="paper-label px-7 py-3 text-brown">Your request</span>
          <span className="paper-label border-l-2 border-l-stamp/35 px-7 py-3 text-brown">What the reply says</span>
        </li>
        {requests.map((request, index) => {
          const matched = alignment[request.id] ?? [];
          return (
            <li key={request.id} className="grid border-b border-rule last:border-b-0 lg:grid-cols-2">
              <div className="flex gap-3 px-5 py-5 sm:px-7">
                <span className="pt-0.5 font-mono text-[15px] font-semibold text-ink-blue">{index + 1}.</span>
                <div className="min-w-0">
                  <p className="font-serif text-[16px] leading-relaxed text-ink">{request.title}</p>
                  <p className="mt-1 font-mono text-[11.5px] text-muted">{request.id}</p>
                </div>
              </div>
              <div className="border-t border-dashed border-edge bg-paper-light px-5 py-5 sm:px-7 lg:border-l-2 lg:border-t-0 lg:border-solid lg:border-l-stamp/35">
                {matched.length === 0 ? (
                  <p className="font-hand text-[17px] text-stamp">No matching passage found</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {matched.map((passage) => (
                      <Quote key={passage.id} passage={passage} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// The PIO's reply on a sheet, every line a finding rests on marked with a highlighter in the
// finding's colour and numbered with its request; the findings themselves beside it.
export function ClassifyStep({
  requests,
  results,
  passages,
  summary,
}: {
  requests: InformationRequest[];
  results: Record<string, ClassificationResult>;
  passages: ResponsePassage[];
  summary?: string;
}) {
  const findings = requests
    .map((request, index) => ({ request, n: index + 1, result: results[request.id] }))
    .filter((finding): finding is { request: InformationRequest; n: number; result: ClassificationResult } =>
      Boolean(finding.result),
    );
  // Which findings cite each passage of the reply, in request order.
  const citedBy = new Map<string, { n: number; tone: LabelTone }[]>();
  for (const { n, result } of findings) {
    for (const passage of result.evidence) {
      citedBy.set(passage.id, [...(citedBy.get(passage.id) ?? []), { n, tone: LABEL_TONE[result.label] }]);
    }
  }
  const onSheet = new Set(passages.map((passage) => passage.id));

  return (
    <div className="flex flex-col gap-5">
      {summary && (
        <section
          aria-labelledby="reply-summary-heading"
          className="rounded-lg border border-edge bg-white p-5 shadow-[0_2px_0_#ECE3D1,0_18px_40px_rgba(28,25,23,0.10)] sm:p-7"
        >
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-brown">In simple words</p>
          <h2 id="reply-summary-heading" className="mt-1.5 font-title text-[32px] font-bold uppercase leading-none text-ink sm:text-[38px]">
            What the reply says
          </h2>
          <p className="mt-3 max-w-[58em] font-serif text-[16.5px] leading-[1.7] text-ink sm:text-[18px]">{summary}</p>
          <p className="mt-3 text-[13px] text-muted">Written by AI from the reply. Check it against the reply below.</p>
        </section>
      )}
      <p aria-hidden="true" className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-ink-3">
        <span><span className="hl hl-good">Answered</span></span>
        <span><span className="hl hl-part">Partly answered</span></span>
        <span><span className="hl hl-bad">Refused or dodged</span></span>
        <span><span className="hl hl-info">Another next step</span></span>
      </p>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-x-11">
        <Sheet label="The PIO's reply" className="px-5 pb-10 pt-14 sm:px-12 sm:pb-12 lg:sticky lg:top-24">
          {passages.length === 0 ? (
            <p className="text-sm text-muted">No text was read from the reply.</p>
          ) : (
            <div className="flex flex-col gap-4 font-serif text-[15px] leading-[1.9] text-ink-3">
              {passages.map((passage) => {
                const cites = citedBy.get(passage.id);
                if (!cites) return <p key={passage.id}>{passage.text}</p>;
                return (
                  <p key={passage.id} className="text-ink">
                    {cites.map((cite) => (
                      <span key={cite.n} className="mr-1.5">
                        <Tag n={cite.n} tone={cite.tone} />
                      </span>
                    ))}
                    <mark className={"hl text-ink hl-" + cites[0].tone}>{passage.text}</mark>
                  </p>
                );
              })}
            </div>
          )}
        </Sheet>

        <section aria-labelledby="findings-heading" className="overflow-hidden rounded-lg border border-edge bg-card">
          <h3
            id="findings-heading"
            className="border-b border-edge px-5 py-4 font-title text-2xl font-bold uppercase leading-none text-ink"
          >
            Findings
          </h3>
          <ul>
            {findings.map(({ request, n, result }) => (
              <li key={request.id} className="border-b border-rule px-5 py-4 last:border-b-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="flex min-w-0 flex-1 items-start gap-2 text-[14.5px] font-semibold leading-snug text-ink">
                    <Tag n={n} tone={LABEL_TONE[result.label]} />
                    <span>{request.title}</span>
                  </p>
                  <LabelBadge label={result.label} />
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{result.explanation}</p>
                {result.label === "INSUFFICIENT_EVIDENCE" && result.abstentionReason && (
                  <p className="mt-1 text-[13px] text-muted">Reason: {result.abstentionReason}</p>
                )}
                {result.evidence.length > 0 && (
                  <div className="mt-2 flex flex-col gap-2">
                    {result.evidence.map((passage) =>
                      onSheet.has(passage.id) ? (
                        <p key={passage.id} className="text-[12.5px] text-muted">
                          Marked on the reply: <PassageRef passage={passage} />
                        </p>
                      ) : (
                        <Quote key={passage.id} passage={passage} />
                      ),
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function LabelBadge({ label }: { label: ClassificationLabel }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold " +
        BADGE[LABEL_TONE[label]]
      }
    >
      {LABEL_TEXT[label]}
    </span>
  );
}

export function SummaryStep({
  requests,
  results,
  onFileFollowUp,
  onDraftAppeal,
}: {
  requests: InformationRequest[];
  results: Record<string, ClassificationResult>;
  onFileFollowUp: (followUp: FollowUpContext) => void;
  // Absent in demo mode, where there is no backend to draft with.
  onDraftAppeal?: (items: AppealItem[]) => Promise<string>;
}) {
  const counts: Partial<Record<ClassificationResult["label"], number>> = {};
  for (const request of requests) {
    const result = results[request.id];
    if (!result) continue;
    counts[result.label] = (counts[result.label] ?? 0) + 1;
  }
  const total = requests.length;

  const unanswered = requests.filter((r) => {
    const label = results[r.id]?.label;
    return label !== undefined && FOLLOW_UP_LABELS.includes(label);
  });
  const others = requests.filter((r) => results[r.id] && !unanswered.includes(r));

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(unanswered.map((r) => r.id)),
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [appealText, setAppealText] = useState("");
  const [appealError, setAppealError] = useState("");
  const [isDraftingAppeal, setIsDraftingAppeal] = useState(false);
  const [appealCopied, setAppealCopied] = useState(false);

  function handleDraftAppeal() {
    if (!onDraftAppeal) return;
    const items: AppealItem[] = unanswered
      .filter((r) => selected.has(r.id))
      .map((r) => ({
        requestId: r.id,
        title: r.title,
        label: results[r.id].label,
        explanation: results[r.id].explanation,
      }));
    setAppealError("");
    setIsDraftingAppeal(true);
    onDraftAppeal(items)
      .then(setAppealText)
      .catch(() => setAppealError("We couldn't draft the appeal. Please try again."))
      .finally(() => setIsDraftingAppeal(false));
  }

  function copyAppeal() {
    navigator.clipboard
      ?.writeText(appealText)
      .then(() => {
        setAppealCopied(true);
        setTimeout(() => setAppealCopied(false), 2000);
      })
      .catch(() => setAppealCopied(false));
  }

  function handleFileFollowUp() {
    const followUpRequests: InformationRequest[] = unanswered
      .filter((r) => selected.has(r.id))
      .map((r) => {
        const result = results[r.id];
        return {
          ...r,
          id: `FU-${r.id}`,
          source: "follow-up",
          context: `Earlier reply (${LABEL_TEXT[result.label].toLowerCase()}): ${result.explanation}`,
          publiclyAvailable: undefined,
          publicSource: undefined,
        };
      });
    onFileFollowUp({
      originalAuthority: requests[0]?.authority ?? "",
      requests: followUpRequests,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {(Object.keys(counts) as ClassificationResult["label"][]).map((label) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-[14px] text-ink-2 sm:w-44">{LABEL_TEXT[label]}</span>
            <div className="h-2.5 flex-1 rounded-full bg-paper-deep">
              <div
                className={"h-2.5 rounded-full " + BAR[LABEL_TONE[label]]}
                style={{ width: `${((counts[label] ?? 0) / total) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right font-mono text-sm font-semibold text-ink-3">{counts[label]}</span>
          </div>
        ))}
      </div>

      {unanswered.length > 0 ? (
        <div className="flex flex-col gap-4 rounded-lg border border-[#f2b8b0] bg-[#fff7f5] p-5">
          <div>
            <p className="font-title text-2xl font-bold uppercase leading-none text-stamp">
              {unanswered.length} of {total} request{total === 1 ? " was" : "s were"} not fully
              answered
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
              Select the ones you still want. You can draft a first appeal against this reply, or
              start a follow-up RTI with them and the context from this reply.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {unanswered.map((request) => {
              const result = results[request.id];
              return (
                <label
                  key={request.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-edge bg-white p-3.5"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(request.id)}
                    onChange={() => toggle(request.id)}
                    className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-ink-blue"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="font-serif text-[15px] font-semibold text-ink">{request.title}</span>
                      <LabelBadge label={result.label} />
                    </span>
                    <span className="text-[13px] leading-relaxed text-ink-3">{result.explanation}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted">
              If the reply was incomplete, you can also file a First Appeal (Section 19(1)) within
              30 days of receiving it.
            </p>
            <div className="flex flex-wrap gap-2">
              <SecondaryButton onClick={handleFileFollowUp} disabled={selected.size === 0}>
                <FilePlus2 size={14} />
                File follow-up RTI ({selected.size})
              </SecondaryButton>
              {onDraftAppeal && (
                <PrimaryButton
                  onClick={handleDraftAppeal}
                  disabled={selected.size === 0 || isDraftingAppeal}
                >
                  {isDraftingAppeal ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Scale size={14} />
                  )}
                  Draft first appeal ({selected.size})
                </PrimaryButton>
              )}
            </div>
          </div>
          {appealError && <p className="text-[14px] font-medium text-stamp">{appealError}</p>}
          {appealText && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-title text-2xl font-bold uppercase leading-none text-ink">Your first appeal</p>
                <div className="flex gap-2">
                  <SecondaryButton onClick={copyAppeal}>
                    {appealCopied ? <Check size={14} /> : <Copy size={14} />}
                    {appealCopied ? "Copied" : "Copy"}
                  </SecondaryButton>
                  <SecondaryButton
                    onClick={() => printText("First appeal", appealText)}
                    aria-label="Print or save as PDF"
                  >
                    <Printer size={14} />
                    PDF
                  </SecondaryButton>
                </div>
              </div>
              <Sheet className="px-5 pb-8 pt-10 sm:px-10">
                <pre className="whitespace-pre-wrap break-words font-serif text-[14px] leading-[1.75] text-ink">{appealText}</pre>
              </Sheet>
              <p className="text-[13px] text-muted">
                Fill in the parts in [brackets], read it through, and send it to the First Appellate
                Authority within 30 days of the reply. This is not legal advice.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-[#9fd5ae] bg-leaf-wash p-5">
          <p className="text-[15px] font-medium text-leaf">
            Every request was answered or has a clear next step — no follow-up RTI needed.
          </p>
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-title text-2xl font-bold uppercase leading-none text-ink">Other requests</p>
          {others.map((request) => {
            const result = results[request.id];
            return (
              <div
                key={request.id}
                className="flex flex-col gap-1 rounded-md border border-edge bg-card p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-serif text-[15px] text-ink">{request.title}</span>
                  <LabelBadge label={result.label} />
                </div>
                {NEXT_STEP_HINT[result.label] && (
                  <span className="text-[13px] text-muted">{NEXT_STEP_HINT[result.label]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
