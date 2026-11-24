import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
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
import { postalLetterHeading, postalLetterText, printText, printTextWithPhotos } from "../../print";
import PioReview from "../pio-review/PioReview";
import type {
  ApplicantDetails,
  ClarifyQuestion,
  DraftLanguage,
  DraftResult,
  DraftReview,
  InformationRequest,
  PreflightResult,
} from "../../types";
import { PaperCard, Sheet, Stamp } from "../layout/Paper";
import { MULTI_SELECT_SEPARATOR } from "./constants";
import { INSPECTION_IDS, type InspectionKind } from "./inspection";
import type { IssueLocation } from "./location";
import { PhotoLocation } from "./PhotoLocation";
import { useLocationPicker } from "./use-location-picker";
import { useObjectUrl } from "./use-object-url";
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
  photos,
  onPhotosChange,
  location,
  onLocationChange,
}: {
  grievance: string;
  onChange: (value: string) => void;
  error: string;
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  location: IssueLocation | undefined;
  onLocationChange: (location: IssueLocation | undefined) => void;
}) {
  const picker = useLocationPicker(onLocationChange);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="grievance" className="font-serif text-[17px] font-semibold text-ink">
          Describe your issue in plain language
        </label>
        <button
          type="button"
          onClick={picker.locateDevice}
          disabled={picker.isLocating}
          className="flex min-h-9 items-center gap-1.5 rounded-full border border-edge-strong bg-card px-3 text-[13px] font-medium text-ink-3 hover:border-ink-3 disabled:opacity-60"
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
        id="grievance"
        value={grievance}
        onChange={(e) => onChange(e.target.value)}
        rows={7}
        // The API takes 5,000 characters; this leaves room for the "Location:" line the map adds.
        maxLength={4800}
        placeholder="e.g. The road in front of my house has been broken for two years and no one has repaired it..."
        className="paper-field p-4 font-serif text-[15.5px] leading-relaxed"
      />
      {error && <p className="text-[13.5px] font-medium text-stamp">{error}</p>}
      <PhotoLocation
        photos={photos}
        onPhotosChange={onPhotosChange}
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
    <div className="flex flex-col gap-8">
      {questions.map((question) => {
        const chosen = question.multi
          ? answers[question.key]?.split(MULTI_SELECT_SEPARATOR).filter(Boolean) ?? []
          : [];
        return (
          <div key={question.key} className="flex flex-col gap-2">
            <label className="font-serif text-[17px] font-semibold text-ink">
              {question.question}
              {question.multi && (
                <span className="ml-1.5 font-sans text-sm font-normal text-muted">(choose all that apply)</span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {question.options.map((option) => {
                const isSelected = question.multi ? chosen.includes(option) : answers[question.key] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (!question.multi) {
                        onSelect(question.key, option);
                        return;
                      }
                      const next = isSelected
                        ? chosen.filter((value) => value !== option)
                        : [...chosen, option];
                      onSelect(question.key, next.join(MULTI_SELECT_SEPARATOR));
                    }}
                    className={
                      "min-h-10 rounded-full border px-4 text-[14.5px] transition-colors " +
                      (isSelected
                        ? "border-ink-blue bg-ink-blue font-medium text-white"
                        : "border-edge-strong bg-card text-ink-2 hover:border-ink-3")
                    }
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {error && <p className="text-[13.5px] font-medium text-stamp">{error}</p>}
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
      <p className="text-[15px] leading-relaxed text-ink-3">
        {isFollowUp
          ? "These requests were not fully answered in the earlier reply. Review them, remove any you no longer need, or add more."
          : "Your grievance has been broken down into the following structured information requests. Remove any you don't need, or add your own."}
      </p>
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} onRemove={() => onRemove(request.id)} />
      ))}

      {requests.length === 0 && (
        <p className="rounded-lg border border-dashed border-edge-strong p-5 text-center text-sm text-muted">
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
        <div className="flex flex-col gap-4 rounded-lg border border-edge bg-card p-4 sm:p-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="custom-request-title" className="text-sm font-semibold text-ink">
              What information do you want?
            </label>
            <textarea
              id="custom-request-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="e.g. Name of the contractor and the date the repair work was completed"
              className="paper-field p-3 text-sm leading-relaxed"
            />
            <p className="text-xs leading-relaxed text-muted">
              Ask for specific records or facts (copies, dates, amounts, names) rather than
              opinions or explanations, so the authority can't easily deny it.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="custom-request-category" className="text-sm font-semibold text-ink">
              Category <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="custom-request-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={80}
              placeholder="e.g. Contract, Expenditure, Attendance"
              className="paper-field min-h-11 px-3 text-sm"
            />
          </div>
          {formError && <p className="text-[13.5px] font-medium text-stamp">{formError}</p>}
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
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-dashed border-edge-strong p-3 text-[15px] font-medium text-ink-2 hover:border-ink-3 hover:bg-card"
        >
          <Plus size={16} />
          Add your own request
        </button>
      )}

      {error && <p className="text-[13.5px] font-medium text-stamp">{error}</p>}
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
      className="rounded-lg border border-[#b9e2c5] bg-leaf-wash p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="inspection-offer-heading" className="font-title text-[22px] font-bold uppercase leading-none text-leaf">
          Go beyond papers: see the work itself
        </h3>
        {suggested && (
          <span className="rounded-full bg-leaf px-2.5 py-0.5 text-[11.5px] font-semibold text-white">
            Suggested for your complaint
          </span>
        )}
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
        The RTI Act also lets you inspect the road work and its records, and take certified
        samples of the material used (Section 2(j)). Papers can say anything; the road can&apos;t.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {OFFERS.map(({ kind, icon: Icon, label, added: addedLabel }) =>
          added[kind] ? (
            <span
              key={kind}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[#9fd5ae] bg-white px-3.5 text-sm font-semibold text-leaf"
            >
              <Check size={14} />
              {addedLabel}
            </span>
          ) : (
            <button
              key={kind}
              type="button"
              onClick={() => onAdd(kind)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-leaf bg-white px-3.5 text-sm font-semibold text-leaf hover:bg-[#e6f6ec]"
            >
              <Icon size={14} />
              {label}
            </button>
          ),
        )}
      </div>
      <details className="mt-3 text-[13.5px] text-ink-2">
        <summary className="cursor-pointer font-semibold text-leaf">What happens next?</summary>
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
          <p className="text-sm font-semibold text-ink">
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

const RELATIONS: { value: ApplicantDetails["relation"]; label: string }[] = [
  { value: "son", label: "Son" },
  { value: "daughter", label: "Daughter" },
  { value: "wife", label: "Wife" },
];

// Asked only once requests (and the officer check) are settled, and only for the PDF letter: the
// portal's own text box has its own name/address/fee fields, so nothing here reaches the backend.
export function ApplicantDetailsStep({
  details,
  onChange,
  error,
}: {
  details: ApplicantDetails;
  onChange: (details: ApplicantDetails) => void;
  error: string;
}) {
  function set<K extends keyof ApplicantDetails>(key: K, value: ApplicantDetails[K]) {
    onChange({ ...details, [key]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-ink-3">
        Used only to fill in the printed letter&apos;s particulars (the online portal has its own
        such fields). Everything here stays on this device.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="applicant-name" className="text-sm font-semibold text-ink">
          Your full name
        </label>
        <input
          id="applicant-name"
          type="text"
          value={details.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={200}
          className="paper-field min-h-11 px-3 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-semibold text-ink">You are the</label>
        <div className="flex flex-wrap gap-2">
          {RELATIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={details.relation === value}
              onClick={() => set("relation", value)}
              className={
                "min-h-10 rounded-full border px-4 text-[14.5px] transition-colors " +
                (details.relation === value
                  ? "border-ink-blue bg-ink-blue font-medium text-white"
                  : "border-edge-strong bg-card text-ink-2 hover:border-ink-3")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="applicant-relative" className="text-sm font-semibold text-ink">
          {details.relation === "wife" ? "Husband's name" : "Father's name"}
        </label>
        <input
          id="applicant-relative"
          type="text"
          value={details.relativeName}
          onChange={(e) => set("relativeName", e.target.value)}
          maxLength={200}
          className="paper-field min-h-11 px-3 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="applicant-address" className="text-sm font-semibold text-ink">
          Your address
        </label>
        <textarea
          id="applicant-address"
          value={details.address}
          onChange={(e) => set("address", e.target.value)}
          rows={2}
          maxLength={400}
          className="paper-field p-3 text-sm leading-relaxed"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="applicant-phone" className="text-sm font-semibold text-ink">
            Telephone <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="applicant-phone"
            type="tel"
            value={details.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)}
            maxLength={30}
            className="paper-field min-h-11 px-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="applicant-mobile" className="text-sm font-semibold text-ink">
            Mobile <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="applicant-mobile"
            type="tel"
            value={details.mobile ?? ""}
            onChange={(e) => set("mobile", e.target.value)}
            maxLength={30}
            className="paper-field min-h-11 px-3 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-[13.5px] font-medium text-stamp">{error}</p>}
    </div>
  );
}

// A warning on the paper: amber, like a sticky note.
const NOTICE =
  "flex max-w-3xl items-start gap-2.5 rounded-lg border border-[#f0d9a8] bg-[#fff8e8] p-4 text-[14px] text-[#7a4508]";

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
  photos,
  applicant,
  language,
  onLanguageChange,
  isUpdating,
  onUseText,
}: {
  draft: DraftResult;
  requests: InformationRequest[];
  photos: File[];
  applicant: ApplicantDetails;
  language: DraftLanguage;
  onLanguageChange: (language: DraftLanguage) => void;
  isUpdating: boolean;
  // The PIO review's improved version, when the citizen chooses to use it.
  onUseText?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  // The PIO review of the text on the sheet, once it has run: its score is stamped on the sheet.
  const [review, setReview] = useState<DraftReview | undefined>();
  const flaggedTitles = requests.filter((request) => draft.flaggedRequestIds.includes(request.id));
  const today = new Date();
  // Photos are listed and previewed separately below, and attached as their own pages when
  // printed -- no need for a text line about them too, which only left a near-empty page of its
  // own ahead of the actual photo pages.
  const authority = requests[0]?.authority ?? "The Public Works Department (PWD)";
  const heading = postalLetterHeading(language);
  const fullLetter = postalLetterText(draft.draftText, authority, language, applicant);

  function printDraft() {
    if (photos.length > 0) {
      printTextWithPhotos("RTI application", fullLetter, photos, heading);
    } else {
      printText("RTI application", fullLetter, heading);
    }
  }

  function copyDraft() {
    navigator.clipboard
      ?.writeText(fullLetter)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  }

  return (
    <div className="flex flex-col gap-6">
      {draft.overLimit && (
        <div className={NOTICE}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>{draft.warning}</p>
        </div>
      )}

      {flaggedTitles.length > 0 && (
        <div className={NOTICE}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">These requests may still be too vague for a PIO to act on:</p>
            <ul className="mt-1 list-inside list-disc">
              {flaggedTitles.map((request) => (
                <li key={request.id}>{request.title}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* On a wide screen: the sheet, with the review under it and the panel to send it beside
          both. On a phone the panel comes straight after the sheet. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-11">
        <div className="flex min-w-0 flex-col gap-3">
          {/* Shown like the page it becomes: a serif letter on a white sheet, not code. */}
          <Sheet label="Your application" className="px-5 pb-12 pt-14 sm:px-12 sm:pb-16 lg:px-16">
            <p className="mb-5 text-center font-serif text-[15px] font-bold text-ink sm:text-base">{heading}</p>
            <pre className="whitespace-pre-wrap break-words font-serif text-[14px] leading-[1.75] text-ink sm:text-[15px]">
              {fullLetter}
            </pre>
            {review && (
              <Stamp
                top={review.verdict === "ready" ? "PIO-PROOF" : "PIO SCORE"}
                main={`${review.score}/${review.outOf}`}
                className="absolute bottom-5 right-4 sm:bottom-12 sm:right-12"
              />
            )}
          </Sheet>
          <p className="text-right text-xs text-muted">
            {draft.charCount.toLocaleString()} / 3,000 characters in the request text above (the
            portal box&apos;s limit)
          </p>

          {photos.length > 0 && (
            <div className="rounded-lg border border-edge bg-card p-4">
              <p className="mb-2.5 text-sm font-semibold text-ink">
                Enclosure{photos.length > 1 ? "s" : ""}: {photos.length} photograph
                {photos.length > 1 ? "s" : ""} of the issue
              </p>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo, index) => (
                  <EnclosurePhoto key={`${photo.name}-${index}`} photo={photo} />
                ))}
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-muted">
                Listed on the printed copy as an enclosure. Attach the actual photo(s) yourself when
                you file -- they stay on this device and are never uploaded.
              </p>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <PaperCard title="Send it">
            <div className="flex items-center gap-2">
              <div
                role="group"
                aria-label="Draft language"
                className="inline-flex rounded-full border border-edge-strong bg-white p-[3px]"
              >
                {LANGUAGES.map(({ code, label }) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={language === code}
                    disabled={isUpdating}
                    onClick={() => code !== language && onLanguageChange(code)}
                    className={
                      "min-h-9 rounded-full px-4 text-sm font-medium transition-colors disabled:opacity-60 " +
                      (language === code ? "bg-ink text-white" : "text-ink-2 hover:bg-ink/5")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              {isUpdating && <Loader2 size={16} className="animate-spin text-muted" />}
            </div>
            <div className="mt-3.5 flex gap-2.5">
              <SecondaryButton onClick={copyDraft} disabled={isUpdating} className="flex-1 px-3">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy draft"}
              </SecondaryButton>
              <SecondaryButton
                onClick={printDraft}
                disabled={isUpdating}
                aria-label="Print or save as PDF"
                className="flex-1 px-3"
              >
                <Printer size={16} />
                PDF
              </SecondaryButton>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              &quot;Copy draft&quot; copies the full letter as text (paste it into Word or an
              email). &quot;PDF&quot; saves the same letter, with any photos attached as extra
              pages, as a file. Filing on the online portal instead? Its own text box only wants
              the numbered request paragraphs: select and copy just that part.
            </p>
          </PaperCard>

          <PaperCard tone="blue" title={`If you file today, ${dateAfter(today, 0)}`}>
            <ul className="flex flex-col gap-2 text-[14px] leading-relaxed text-ink-2">
              <li>
                The PIO must reply by <b className="font-semibold text-ink">{dateAfter(today, 30)}</b>{" "}
                (Section 7(1)).
              </li>
              <li>
                No reply, or an incomplete one? You can file a first appeal until{" "}
                <b className="font-semibold text-ink">{dateAfter(today, 60)}</b> (Section 19(1): within
                30 days of the deadline or the reply).
              </li>
            </ul>
          </PaperCard>
        </aside>

        <div className="min-w-0 lg:col-start-1">
          <PioReview text={draft.draftText} onUse={onUseText} onReview={setReview} />
        </div>
      </div>

      <p className="max-w-3xl text-[13.5px] leading-relaxed text-muted">
        Read the draft before you file it: RTI Copilot is an assistant, not legal advice. You file
        the application yourself, online on the Delhi Government&apos;s RTI portal or by post to
        the PIO. RTI Copilot never submits applications or stores your portal credentials.
      </p>
    </div>
  );
}

function EnclosurePhoto({ photo }: { photo: File }) {
  const url = useObjectUrl(photo);
  if (!url) return null;
  return (
    <img
      src={url}
      alt="An enclosed photo of the issue"
      className="h-16 w-16 rounded-md border border-edge object-cover"
    />
  );
}
