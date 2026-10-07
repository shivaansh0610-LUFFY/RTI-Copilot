import { ExternalLink, FileText, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import type { InformationRequest } from "../../types";
import { AUTHORITY_OPTIONS, PERIOD_OPTIONS } from "./constants";
import {
  CategoryBadge,
  PrimaryButton,
  QualityBadge,
  RequestCard,
  SecondaryButton,
  SourceBadge,
} from "./ui";

export function DescribeStep({
  grievance,
  onChange,
  error,
}: {
  grievance: string;
  onChange: (value: string) => void;
  error: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-900">
        Describe your issue in plain language
      </label>
      <textarea
        value={grievance}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder="e.g. The road in front of my house has been broken for two years and no one has repaired it..."
        className="rounded-md border border-slate-300 p-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
      />
      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </div>
  );
}

export function ClarifyStep({
  answers,
  onSelect,
  error,
}: {
  answers: Record<string, string>;
  onSelect: (key: string, value: string) => void;
  error: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-900">
          What time period does this relate to?
        </label>
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSelect("period", option)}
              className={
                "rounded-full border px-3 py-1.5 text-sm " +
                (answers.period === option
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-700")
              }
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-900">
          Do you know which government department is responsible?
        </label>
        <div className="flex flex-wrap gap-2">
          {AUTHORITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect("knowsAuthority", option.value)}
              className={
                "rounded-full border px-3 py-1.5 text-sm " +
                (answers.knowsAuthority === option.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-700")
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </div>
  );
}

export function RequestsStep({
  requests,
  isFollowUp,
  onAdd,
  onRemove,
  error,
}: {
  requests: InformationRequest[];
  isFollowUp: boolean;
  onAdd: (title: string, category: string) => Promise<void>;
  onRemove: (id: string) => void;
  error: string;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function resetForm() {
    setIsAdding(false);
    setTitle("");
    setCategory("");
    setFormError("");
  }

  function handleAdd() {
    if (title.trim().length < 10) {
      setFormError("Please describe the information you want in at least 10 characters.");
      return;
    }
    setIsSaving(true);
    onAdd(title, category).then(() => {
      setIsSaving(false);
      resetForm();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        {isFollowUp
          ? "These requests were not fully answered in the earlier reply. Review them, remove any you no longer need, or add more."
          : "Your grievance has been broken down into the following structured information requests. Remove any you don't need, or add your own."}
      </p>
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} onRemove={() => onRemove(request.id)} />
      ))}

      {requests.length === 0 && (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          No requests yet. Add at least one to continue.
        </p>
      )}

      {isAdding ? (
        <div className="flex flex-col gap-3 rounded-md border border-slate-300 p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="custom-request-title" className="text-sm font-medium text-slate-900">
              What information do you want?
            </label>
            <textarea
              id="custom-request-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              placeholder="e.g. Name of the contractor and the date the repair work was completed"
              className="rounded-md border border-slate-300 p-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
            />
            <p className="text-xs text-slate-500">
              Ask for specific records or facts (copies, dates, amounts, names) rather than
              opinions or explanations, so the authority can't easily deny it.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="custom-request-category" className="text-sm font-medium text-slate-900">
              Category <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="custom-request-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Contract, Expenditure, Attendance"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
            />
          </div>
          {formError && <p className="text-[13px] text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={resetForm} disabled={isSaving}>
              Cancel
            </SecondaryButton>
            <PrimaryButton onClick={handleAdd} disabled={isSaving}>
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              Add request
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 p-3 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-white"
        >
          <Plus size={16} />
          Add your own request
        </button>
      )}

      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </div>
  );
}

export function PublicCheckStep({ requests }: { requests: InformationRequest[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        We checked whether this information is already available from a public source.
      </p>
      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          rightSlot={
            request.publiclyAvailable ? (
              <span className="inline-flex items-center rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
                Already public
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                Include in RTI
              </span>
            )
          }
        >
          {request.publiclyAvailable && request.publicSource && (
            <a
              href={request.publicSource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-xs hover:border-slate-300"
            >
              <ExternalLink size={14} className="mt-0.5 shrink-0 text-blue-700" />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-blue-700">{request.publicSource.title}</span>
                <span className="truncate text-slate-500">{request.publicSource.url}</span>
              </span>
            </a>
          )}
        </RequestCard>
      ))}
    </div>
  );
}

export function QualityReviewStep({
  requests,
  onTitleChange,
}: {
  requests: InformationRequest[];
  onTitleChange: (id: string, title: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        A few requests could use more detail. Edit the title below to make them more specific.
      </p>
      {requests.map((request) =>
        request.quality === "needs-detail" ? (
          <div key={request.id} className="rounded-md border border-slate-200 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CategoryBadge>{request.category}</CategoryBadge>
              <QualityBadge quality={request.quality} />
              <SourceBadge source={request.source} />
            </div>
            <input
              type="text"
              defaultValue={request.title}
              onBlur={(e) => onTitleChange(request.id, e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              {request.authority} &middot; {request.period}
            </p>
          </div>
        ) : (
          <RequestCard key={request.id} request={request} />
        ),
      )}
    </div>
  );
}

export function DraftStep({ draftText }: { draftText: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-4">
        <FileText size={18} className="text-slate-500" />
        <pre className="whitespace-pre-wrap font-mono text-xs text-slate-800">{draftText}</pre>
      </div>
      <p className="text-[13px] text-slate-500">
        You file this application yourself on the official RTI portal (rtionline.gov.in or your
        state portal). RTI Copilot never submits applications or stores your portal credentials.
      </p>
    </div>
  );
}
