import { CalendarClock, Check, Copy, FileSearch, Trash2 } from "lucide-react";
import { useState } from "react";
import { deadlineStatus, formatDate, type TrackedRti } from "./tracking";

export default function MyRtis({
  rtis,
  onUpdate,
  onDelete,
  onAnalyse,
  onStart,
}: {
  rtis: TrackedRti[];
  onUpdate: (rti: TrackedRti) => void;
  onDelete: (key: string) => void;
  onAnalyse: (rti: TrackedRti) => void;
  onStart: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">My RTIs</h1>
        <p className="text-[13px] text-slate-500">
          Saved in this browser only. After you file, add the date and registration number to see
          when the reply is due and until when you can appeal.
        </p>
      </div>

      {rtis.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-slate-300 p-6">
          <p className="text-sm text-slate-600">No applications yet. Each one you draft appears here.</p>
          <button
            type="button"
            onClick={onStart}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Start my RTI
          </button>
        </div>
      ) : (
        rtis.map((rti) => (
          <RtiCard
            key={rti.key}
            rti={rti}
            onUpdate={onUpdate}
            onDelete={() => onDelete(rti.key)}
            onAnalyse={() => onAnalyse(rti)}
          />
        ))
      )}
    </div>
  );
}

function RtiCard({
  rti,
  onUpdate,
  onDelete,
  onAnalyse,
}: {
  rti: TrackedRti;
  onUpdate: (rti: TrackedRti) => void;
  onDelete: () => void;
  onAnalyse: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const status = deadlineStatus(rti.filedOn);
  const today = new Date().toISOString().slice(0, 10);

  function copyDraft() {
    navigator.clipboard
      ?.writeText(rti.draftText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  }

  return (
    <article className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-slate-900">{rti.title}</h2>
          <p className="text-xs text-slate-500">
            Drafted {formatDate(new Date(rti.createdAt))} · {rti.requests.length} request
            {rti.requests.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Delete this application from this browser?")) onDelete();
          }}
          aria-label={`Delete "${rti.title}"`}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Filed on
          <input
            type="date"
            max={today}
            value={rti.filedOn ?? ""}
            onChange={(e) => onUpdate({ ...rti, filedOn: e.target.value || undefined })}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-slate-600">
          Registration no.
          <input
            type="text"
            maxLength={60}
            value={rti.registrationNo ?? ""}
            placeholder="From the portal's acknowledgement"
            onChange={(e) => onUpdate({ ...rti, registrationNo: e.target.value || undefined })}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
          />
        </label>
      </div>

      <DeadlineLine status={status} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAnalyse}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
        >
          <FileSearch size={13} />
          Analyse the reply
        </button>
        <button
          type="button"
          onClick={copyDraft}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy draft"}
        </button>
      </div>
    </article>
  );
}

function DeadlineLine({ status }: { status: ReturnType<typeof deadlineStatus> }) {
  const base = "flex items-start gap-2 rounded-md p-2 text-[13px] ";
  if (status.kind === "not-filed") {
    return (
      <p className={base + "bg-slate-50 text-slate-600"}>
        <CalendarClock size={15} className="mt-0.5 shrink-0" />
        Not filed yet. Add the date once you file it.
      </p>
    );
  }
  if (status.kind === "waiting") {
    return (
      <p className={base + "bg-blue-50 text-blue-900"}>
        <CalendarClock size={15} className="mt-0.5 shrink-0" />
        Reply due by {formatDate(status.replyDue)}
        {status.daysLeft === 0 ? " (today)" : ` (${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} left)`}.
      </p>
    );
  }
  if (status.kind === "appeal-window") {
    return (
      <p className={base + "bg-amber-50 text-amber-900"}>
        <CalendarClock size={15} className="mt-0.5 shrink-0" />
        The reply was due by {formatDate(status.replyDue)}. No reply yet? You can file a first appeal
        until {formatDate(status.appealUntil)} ({status.daysLeft} day{status.daysLeft === 1 ? "" : "s"}{" "}
        left).
      </p>
    );
  }
  return (
    <p className={base + "bg-slate-50 text-slate-600"}>
      <CalendarClock size={15} className="mt-0.5 shrink-0" />
      The usual first-appeal window closed on {formatDate(status.appealUntil)}. An appeal can still
      be filed late with reasons for the delay.
    </p>
  );
}
