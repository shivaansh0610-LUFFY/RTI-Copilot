import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import type {
  ClassificationResult,
  InformationRequest,
  ResponsePassage,
  ReviewVerdict,
} from "../../types";
import { LABEL_BADGE_CLASSES, LABEL_TEXT } from "./constants";
import { PrimaryButton, SecondaryButton } from "./ui";

export function UploadStep({
  file,
  onFileSelect,
  onProcess,
  isProcessing,
  processingFailed,
  ingestResult,
  simulateFailure,
  onToggleSimulateFailure,
}: {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  onProcess: () => void;
  isProcessing: boolean;
  processingFailed: boolean;
  ingestResult: { pages: number; passages: ResponsePassage[]; ocrUsed: boolean } | null;
  simulateFailure: boolean;
  onToggleSimulateFailure: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor="response-file"
        className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-slate-300 p-8 text-center"
      >
        <FileUp size={24} className="text-slate-400" />
        <span className="text-sm font-medium text-slate-900">
          {file ? file.name : "Click to select a file, or drop it here"}
        </span>
        <span className="text-xs text-slate-500">Accepts .pdf or .txt</span>
        <input
          id="response-file"
          type="file"
          accept=".pdf,.txt"
          className="hidden"
          onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
        />
      </label>

      {processingFailed && (
        <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-red-50 p-4">
          <AlertTriangle size={16} className="mt-0.5 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-700">Processing failed</p>
            <p className="text-[13px] text-red-600">
              We couldn't process this file. Please retry.
            </p>
          </div>
        </div>
      )}

      {ingestResult && !processingFailed && (
        <div className="rounded-md border border-slate-200 p-4">
          <p className="text-sm font-medium text-slate-900">Response processed</p>
          <p className="mt-1 text-xs text-slate-500">
            {ingestResult.pages} page{ingestResult.pages === 1 ? "" : "s"} &middot;{" "}
            {ingestResult.passages.length} passages extracted &middot; OCR used:{" "}
            {ingestResult.ocrUsed ? "Yes" : "No"}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={simulateFailure}
            onChange={onToggleSimulateFailure}
            className="h-3.5 w-3.5"
          />
          Dev: simulate processing failure
        </label>

        {processingFailed ? (
          <SecondaryButton onClick={onProcess} disabled={isProcessing}>
            {isProcessing && <Loader2 size={14} className="animate-spin" />}
            Retry
          </SecondaryButton>
        ) : (
          <PrimaryButton onClick={onProcess} disabled={!file || isProcessing || Boolean(ingestResult)}>
            {isProcessing && <Loader2 size={14} className="animate-spin" />}
            Process response
          </PrimaryButton>
        )}
      </div>
    </div>
  );
}

export function AlignStep({
  requests,
  alignment,
}: {
  requests: InformationRequest[];
  alignment: Record<string, ResponsePassage[]>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {requests.map((request) => {
        const passages = alignment[request.id] ?? [];
        return (
          <div key={request.id} className="grid grid-cols-2 gap-4 rounded-md border border-slate-200 p-4">
            <div>
              <p className="text-sm font-medium text-slate-900">{request.title}</p>
              <p className="mt-1 text-xs text-slate-500">{request.id}</p>
            </div>
            <div>
              {passages.length === 0 ? (
                <p className="text-sm text-gray-500">No matching passage found</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {passages.map((passage) => (
                    <blockquote key={passage.id} className="border-l-2 border-slate-200 pl-2 text-sm text-slate-700">
                      "{passage.text}"
                      <span className="mt-0.5 block text-xs text-slate-400">
                        p.{passage.page} &para;{passage.paragraph}
                      </span>
                    </blockquote>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ClassificationCard({
  request,
  result,
  reviewSlot,
  reviewed,
}: {
  request: InformationRequest;
  result: ClassificationResult;
  reviewSlot?: React.ReactNode;
  reviewed?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border border-slate-200 p-4 " + (reviewed ? "bg-slate-50" : "")
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{request.title}</p>
        <span
          className={
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
            LABEL_BADGE_CLASSES[result.label]
          }
        >
          {LABEL_TEXT[result.label]}
        </span>
      </div>
      <p className="text-sm text-slate-600">{result.explanation}</p>
      {result.label === "INSUFFICIENT_EVIDENCE" && result.abstentionReason && (
        <p className="mt-1 text-xs text-gray-500">Reason: {result.abstentionReason}</p>
      )}
      {result.evidence.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {result.evidence.map((passage) => (
            <blockquote key={passage.id} className="border-l-2 border-slate-200 pl-2 text-sm text-slate-700">
              "{passage.text}"
              <span className="mt-0.5 block text-xs text-slate-400">
                p.{passage.page} &para;{passage.paragraph}
              </span>
            </blockquote>
          ))}
        </div>
      )}
      {reviewSlot}
    </div>
  );
}

export function ClassifyStep({
  requests,
  results,
}: {
  requests: InformationRequest[];
  results: Record<string, ClassificationResult>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {requests.map((request) => {
        const result = results[request.id];
        if (!result) return null;
        return <ClassificationCard key={request.id} request={request} result={result} />;
      })}
    </div>
  );
}

const VERDICT_LABELS: { value: ReviewVerdict; label: string }[] = [
  { value: "agree", label: "Agree" },
  { value: "disagree", label: "Disagree" },
  { value: "evidence-incorrect", label: "Evidence incorrect" },
];

export function ReviewStep({
  requests,
  results,
  verdicts,
  onVerdict,
}: {
  requests: InformationRequest[];
  results: Record<string, ClassificationResult>;
  verdicts: Record<string, ReviewVerdict>;
  onVerdict: (requestId: string, verdict: ReviewVerdict) => void;
}) {
  const reviewedCount = Object.keys(verdicts).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        {reviewedCount} of {requests.length} reviewed
      </p>
      {requests.map((request) => {
        const result = results[request.id];
        if (!result) return null;
        const verdict = verdicts[request.id];
        return (
          <ClassificationCard
            key={request.id}
            request={request}
            result={result}
            reviewed={Boolean(verdict)}
            reviewSlot={
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                {VERDICT_LABELS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onVerdict(request.id, option.value)}
                    className={
                      "rounded-md border px-3 py-1.5 text-xs font-medium " +
                      (verdict === option.value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 text-slate-700")
                    }
                  >
                    {option.label}
                  </button>
                ))}
                {verdict && <span className="text-xs text-slate-400">Reviewed</span>}
              </div>
            }
          />
        );
      })}
    </div>
  );
}

export function SummaryStep({
  requests,
  results,
  verdicts,
}: {
  requests: InformationRequest[];
  results: Record<string, ClassificationResult>;
  verdicts: Record<string, ReviewVerdict>;
}) {
  const counts: Partial<Record<ClassificationResult["label"], number>> = {};
  for (const request of requests) {
    const result = results[request.id];
    if (!result) continue;
    counts[result.label] = (counts[result.label] ?? 0) + 1;
  }
  const total = requests.length;

  const unreviewedInsufficient = requests.filter(
    (r) => results[r.id]?.label === "INSUFFICIENT_EVIDENCE" && !verdicts[r.id],
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {(Object.keys(counts) as ClassificationResult["label"][]).map((label) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-sm text-slate-700">{LABEL_TEXT[label]}</span>
            <div className="h-2 flex-1 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-slate-900"
                style={{ width: `${((counts[label] ?? 0) / total) * 100}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-right text-sm text-slate-500">{counts[label]}</span>
          </div>
        ))}
      </div>

      {unreviewedInsufficient > 0 && (
        <div className="rounded-md border border-slate-200 bg-gray-50 p-4">
          <p className="text-sm text-slate-700">
            {unreviewedInsufficient} request{unreviewedInsufficient === 1 ? "" : "s"} marked
            "Insufficient evidence" still need{unreviewedInsufficient === 1 ? "s" : ""} human
            review.
          </p>
        </div>
      )}

      <div className="rounded-md border border-slate-200 p-4">
        <p className="text-sm text-slate-700">
          Analysis complete for {total} request{total === 1 ? "" : "s"}. Every finding above is
          grounded in the quoted response passages and can still be revisited from the review
          step.
        </p>
      </div>
    </div>
  );
}
