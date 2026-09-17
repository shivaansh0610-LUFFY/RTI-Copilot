import { FileText } from "lucide-react";
import type { InformationRequest } from "../../types";
import { AUTHORITY_OPTIONS, PERIOD_OPTIONS } from "./constants";
import { CategoryBadge, QualityBadge, RequestCard } from "./ui";

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

export function RequestsStep({ requests }: { requests: InformationRequest[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        Your grievance has been broken down into the following structured information requests.
      </p>
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
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
        />
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
