import { AlertTriangle, FilePlus2, FileUp, Loader2 } from "lucide-react";
import { useState } from "react";
import type {
  ClassificationLabel,
  ClassificationResult,
  FollowUpContext,
  InformationRequest,
  ResponsePassage,
} from "../../types";
import { FOLLOW_UP_LABELS, LABEL_BADGE_CLASSES, LABEL_TEXT, NEXT_STEP_HINT } from "./constants";
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
}: {
  request: InformationRequest;
  result: ClassificationResult;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{request.title}</p>
        <LabelBadge label={result.label} />
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

function LabelBadge({ label }: { label: ClassificationLabel }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium " +
        LABEL_BADGE_CLASSES[label]
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
}: {
  requests: InformationRequest[];
  results: Record<string, ClassificationResult>;
  onFileFollowUp: (followUp: FollowUpContext) => void;
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

      {unanswered.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-md border border-orange-200 bg-orange-50/40 p-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {unanswered.length} of {total} request{total === 1 ? " was" : "s were"} not fully
              answered
            </p>
            <p className="mt-0.5 text-[13px] text-slate-600">
              Select the ones you still want, and we'll start a follow-up RTI with them and the
              context from this reply.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {unanswered.map((request) => {
              const result = results[request.id];
              return (
                <label
                  key={request.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white p-3"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(request.id)}
                    onChange={() => toggle(request.id)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">{request.title}</span>
                      <LabelBadge label={result.label} />
                    </span>
                    <span className="text-xs text-slate-600">{result.explanation}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              If the reply was incomplete, you can also file a First Appeal (Section 19(1)) within
              30 days of receiving it.
            </p>
            <PrimaryButton onClick={handleFileFollowUp} disabled={selected.size === 0}>
              <FilePlus2 size={14} />
              File follow-up RTI ({selected.size})
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            Every request was answered or has a clear next step — no follow-up RTI needed.
          </p>
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-900">Other requests</p>
          {others.map((request) => {
            const result = results[request.id];
            return (
              <div
                key={request.id}
                className="flex flex-col gap-1 rounded-md border border-slate-200 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="text-sm text-slate-900">{request.title}</span>
                  <LabelBadge label={result.label} />
                </div>
                {NEXT_STEP_HINT[result.label] && (
                  <span className="text-xs text-slate-500">{NEXT_STEP_HINT[result.label]}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
