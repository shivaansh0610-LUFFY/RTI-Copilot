import {
  AlertTriangle,
  CalendarClock,
  Check,
  Copy,
  Eye,
  FileText,
  FlaskConical,
  Gavel,
  Loader2,
  MapPin,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { useState } from "react";
import { printText } from "../../print";
import type {
  ClarifyQuestion,
  DraftLanguage,
  DraftResult,
  InformationRequest,
  PreflightResult,
} from "../../types";
import { INSPECTION_IDS, type InspectionKind } from "./inspection";
import type { IssueLocation } from "./location";
import { PhotoLocation } from "./PhotoLocation";
import { useLocationPicker } from "./use-location-picker";
import {
  CategoryBadge,
  PrimaryButton,
  RequestCard,
  SecondaryButton,
  SourceBadge,
} from "./ui";

export function DescribeStep({
  grievance,
  onChange,
  error,
  photo,
  onPhotoChange,
  location,
  onLocationChange,
}: {
  grievance: string;
  onChange: (value: string) => void;
  error: string;
  photo: File | undefined;
  onPhotoChange: (photo: File | undefined) => void;
  location: IssueLocation | undefined;
  onLocationChange: (location: IssueLocation | undefined) => void;
}) {
  const picker = useLocationPicker(onLocationChange);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-900">
          Describe your issue in plain language
        </label>
        <button
          type="button"
          onClick={picker.locateDevice}
          disabled={picker.isLocating}
          className="flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400 disabled:opacity-60"
        >
          {picker.isLocating ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <MapPin size={13} />
          )}
          Use my current location
        </button>
      </div>
      <textarea
        value={grievance}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        // The API takes 5,000 characters; this leaves room for the "Location:" line the map adds.
        maxLength={4800}
        placeholder="e.g. The road in front of my house has been broken for two years and no one has repaired it..."
        className="rounded-md border border-slate-300 p-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
      />
      {error && <p className="text-[13px] text-red-600">{error}</p>}
      <PhotoLocation
        photo={photo}
        onPhotoChange={onPhotoChange}
        location={location}
        picker={picker}
      />
    </div>
  );
}

export function ClarifyStep({
  questions,
  answers,
  onSelect,
  error,
}: {
  questions: ClarifyQuestion[];
  answers: Record<string, string>;
  onSelect: (key: string, value: string) => void;
  error: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {questions.map((question) => (
        <div key={question.key} className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-900">{question.question}</label>
          <div className="flex flex-wrap gap-2">
            {question.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onSelect(question.key, option)}
                className={
                  "rounded-full border px-3 py-1.5 text-sm " +
                  (answers[question.key] === option
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 text-slate-700")
                }
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-[13px] text-red-600">{error}</p>}
    </div>
  );
}

export function RequestsStep({
  requests,
  isFollowUp,
  suggestInspection,
  onAdd,
  onAddInspection,
  onRemove,
  error,
}: {
  requests: InformationRequest[];
  isFollowUp: boolean;
  // The complaint is about a repair that did not last or poor quality.
  suggestInspection: boolean;
  onAdd: (title: string, category: string) => Promise<void>;
  onAddInspection: (kind: InspectionKind) => void;
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

      <InspectionOffer
        suggested={suggestInspection}
        added={{
          inspect: requests.some((r) => r.id === INSPECTION_IDS.inspect),
          samples: requests.some((r) => r.id === INSPECTION_IDS.samples),
        }}
        onAdd={onAddInspection}
      />

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
              maxLength={1000}
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
              maxLength={80}
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

const OFFERS: { kind: InspectionKind; icon: typeof Eye; label: string; added: string }[] = [
  { kind: "inspect", icon: Eye, label: "Ask to inspect the work", added: "Inspection added" },
  { kind: "samples", icon: FlaskConical, label: "Ask for certified samples", added: "Samples added" },
];

// Section 2(j): the right to inspect the work and take certified samples of its material.
function InspectionOffer({
  suggested,
  added,
  onAdd,
}: {
  suggested: boolean;
  added: Record<InspectionKind, boolean>;
  onAdd: (kind: InspectionKind) => void;
}) {
  return (
    <section
      aria-labelledby="inspection-offer-heading"
      className="rounded-md border border-emerald-200 bg-emerald-50/60 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="inspection-offer-heading" className="text-sm font-semibold text-slate-900">
          Go beyond papers: see the work itself
        </h3>
        {suggested && (
          <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-medium text-white">
            Suggested for your complaint
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-slate-700">
        The RTI Act also lets you inspect the road work and its records, and take certified
        samples of the material used (Section 2(j)). Papers can say anything; the road can&apos;t.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {OFFERS.map(({ kind, icon: Icon, label, added: addedLabel }) =>
          added[kind] ? (
            <span
              key={kind}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800"
            >
              <Check size={14} />
              {addedLabel}
            </span>
          ) : (
            <button
              key={kind}
              type="button"
              onClick={() => onAdd(kind)}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700 bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
            >
              <Icon size={14} />
              {label}
            </button>
          ),
        )}
      </div>
      <details className="mt-3 text-[13px] text-slate-700">
        <summary className="cursor-pointer font-medium text-emerald-800">What happens next?</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          <li>The PIO writes to you with a date and time, and any fee with its calculation (Section 7(3)). Pay only what is asked in writing.</li>
          <li>At the inspection, an official shows you the site and the files. Take photos and notes, and ask for copies of any pages you need.</li>
          <li>Samples are sealed and certified by the office. You can get them tested at an accredited (NABL) laboratory, at your own cost.</li>
          <li>If the PIO does not reply in 30 days, or refuses, you can file a first appeal.</li>
        </ul>
      </details>
    </section>
  );
}

// The officer check: each request read the way a reluctant PIO would, with the excuse they
// could use, why it works, and how to fix it. Nothing here blocks: the citizen decides.
export function OfficerCheckStep({
  requests,
  result,
  isStale,
  isChecking,
  error,
  onTitleChange,
  onRecheck,
}: {
  requests: InformationRequest[];
  result: PreflightResult | undefined;
  // The wording changed since the last check.
  isStale: boolean;
  isChecking: boolean;
  error: string;
  onTitleChange: (id: string, title: string) => void;
  onRecheck: () => void;
}) {
  const itemsById = new Map(result?.items.map((item) => [item.requestId, item]));
  const flagged = requests.filter((r) => (itemsById.get(r.id)?.issues.length ?? 0) > 0).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <Gavel size={16} className="mt-0.5 shrink-0 text-slate-700" />
        <p className="text-[13px] text-slate-700">
          We read your requests the way a reluctant Public Information Officer would, looking for
          easy excuses to refuse or delay them. Fix them now, before the 30-day clock starts.
        </p>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-[13px] text-amber-800">{error}</p>
          <SecondaryButton onClick={onRecheck} disabled={isChecking} className="bg-white">
            {isChecking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Try again
          </SecondaryButton>
        </div>
      )}

      {result && (
        <div role="status" className="flex flex-col gap-1">
          <p className="text-sm font-medium text-slate-900">
            {flagged === 0
              ? "No easy excuses found. Your requests ask for specific records."
              : `The officer could use an excuse on ${flagged} of ${requests.length} request${requests.length === 1 ? "" : "s"}.`}
          </p>
          <p className="text-xs text-slate-500">
            {result.aiUsed
              ? "Checked with fixed rules from the RTI Act and by AI. Suggestions only: you decide."
              : "Checked with fixed rules from the RTI Act. Suggestions only: you decide."}
          </p>
        </div>
      )}

      {isStale && result && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 p-3">
          <p className="text-[13px] text-blue-900">You changed the wording. Check it again?</p>
          <SecondaryButton onClick={onRecheck} disabled={isChecking} className="bg-white">
            {isChecking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Check again
          </SecondaryButton>
        </div>
      )}

      {requests.map((request, index) => {
        const item = itemsById.get(request.id);
        if (!item || item.issues.length === 0) {
          return (
            <RequestCard
              key={request.id}
              request={request}
              rightSlot={
                item && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    <ShieldCheck size={12} />
                    No easy excuse
                  </span>
                )
              }
            />
          );
        }
        const suggestion = item.suggestedTitle;
        return (
          <div key={request.id} className="rounded-md border border-amber-300 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <CategoryBadge>{request.category}</CategoryBadge>
              <SourceBadge source={request.source} />
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                <AlertTriangle size={12} />
                {item.issues.length === 1 ? "1 excuse" : `${item.issues.length} excuses`}
              </span>
            </div>
            <textarea
              value={request.title}
              onChange={(e) => onTitleChange(request.id, e.target.value)}
              aria-label={`Wording of request ${index + 1}`}
              rows={2}
              maxLength={1000}
              className="w-full rounded-md border border-slate-300 p-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              {request.authority} &middot; {request.period}
            </p>

            {item.issues.map((issue) => (
              <div key={issue.code} className="mt-3 rounded-md bg-amber-50 p-3 text-[13px]">
                <p className="flex items-center gap-1.5 font-medium text-amber-900">
                  <Gavel size={13} />
                  The officer could reply:
                </p>
                <p className="mt-1 italic text-amber-900">&ldquo;{issue.officerSays}&rdquo;</p>
                <p className="mt-2 text-slate-700">
                  <span className="font-medium">Why this works:</span> {issue.why}{" "}
                  <span className="text-slate-500">({issue.section})</span>
                </p>
                <p className="mt-1 text-slate-700">
                  <span className="font-medium">How to fix it:</span> {issue.fix}
                </p>
              </div>
            ))}

            {suggestion &&
              (request.title === suggestion ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <Check size={13} />
                  Using the suggested wording
                </p>
              ) : (
                <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                    <WandSparkles size={13} />
                    Suggested wording
                  </p>
                  <p className="mt-1 text-sm text-slate-900">{suggestion}</p>
                  <button
                    type="button"
                    onClick={() => onTitleChange(request.id, suggestion)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                  >
                    <Check size={13} />
                    Use this wording
                  </button>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}

const LANGUAGES: { code: DraftLanguage; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी" },
];

// "12 Dec 2026", the date `days` after `from`.
function dateAfter(from: Date, days: number): string {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function DraftStep({
  draft,
  requests,
  language,
  onLanguageChange,
  isUpdating,
}: {
  draft: DraftResult;
  requests: InformationRequest[];
  language: DraftLanguage;
  onLanguageChange: (language: DraftLanguage) => void;
  isUpdating: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const flaggedTitles = requests.filter((request) => draft.flaggedRequestIds.includes(request.id));
  const today = new Date();

  function copyDraft() {
    navigator.clipboard
      ?.writeText(draft.draftText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  }

  return (
    <div className="flex flex-col gap-3">
      {draft.overLimit && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
          <p className="text-[13px] text-amber-800">{draft.warning}</p>
        </div>
      )}

      {flaggedTitles.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="text-[13px] text-amber-800">
            <p className="font-medium">These requests may still be too vague for a PIO to act on:</p>
            <ul className="mt-1 list-inside list-disc">
              {flaggedTitles.map((request) => (
                <li key={request.id}>{request.title}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Draft language" className="flex gap-1">
          {LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              aria-pressed={language === code}
              disabled={isUpdating}
              onClick={() => code !== language && onLanguageChange(code)}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-60 " +
                (language === code
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 text-slate-700")
              }
            >
              {label}
            </button>
          ))}
          {isUpdating && <Loader2 size={14} className="ml-1 animate-spin self-center text-slate-500" />}
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={copyDraft} disabled={isUpdating}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy draft"}
          </SecondaryButton>
          <SecondaryButton
            onClick={() => printText("RTI application", draft.draftText)}
            disabled={isUpdating}
            aria-label="Print or save as PDF"
          >
            <Printer size={14} />
            PDF
          </SecondaryButton>
        </div>
      </div>

      {/* Shown like the page it becomes: a readable font, not code. */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 sm:p-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <FileText size={14} />
          Your application
        </div>
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-800">
          {draft.draftText}
        </pre>
      </div>
      <p className="text-right text-xs text-slate-400">
        {draft.charCount.toLocaleString()} / 3,000 characters
      </p>

      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-[13px] text-blue-900">
        <CalendarClock size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-medium">If you file today ({dateAfter(today, 0)}):</p>
          <ul className="mt-1 list-inside list-disc">
            <li>The PIO must reply by {dateAfter(today, 30)} (Section 7(1)).</li>
            <li>
              No reply, or an incomplete one? You can file a first appeal until{" "}
              {dateAfter(today, 60)} (Section 19(1): within 30 days of the deadline or the reply).
            </li>
          </ul>
        </div>
      </div>

      <p className="text-[13px] text-slate-500">
        Read the draft before you file it: RTI Copilot is an assistant, not legal advice. You file
        the application yourself, online on the Delhi Government&apos;s RTI portal or by post to
        the PIO. RTI Copilot never submits applications or stores your portal credentials.
      </p>
    </div>
  );
}
