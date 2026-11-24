import { Check, Copy, FileSearch, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageContainer, PageHeader } from "../layout/Layout";
import { deadlineStatus, formatDate, type TrackedRti } from "./tracking";

// The columns of the register on a wide screen: No., application, filed on, registration no.,
// deadline, actions. Narrower than that, each entry is a block instead.
const COLUMNS = "xl:grid-cols-[56px_minmax(0,1.4fr)_160px_minmax(0,1.15fr)_minmax(0,1.3fr)_204px]";

const SMALL_BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-sm transition-colors";

// My RTIs as a ruled register, with each deadline as a date stamp.
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
    <PageContainer>
      <PageHeader
        eyebrow="Saved in this browser only"
        title="My RTIs"
        accent="RTIs"
        intro="After you file, add the date and registration number to see when the reply is due and until when you can appeal."
      />

      {rtis.length === 0 ? (
        <div className="paper-sheet flex flex-col items-start gap-4 px-6 py-8 sm:px-8">
          <p className="font-serif text-[17px] text-ink-2">No applications yet. Each one you draft appears here.</p>
          <button
            type="button"
            onClick={onStart}
            className="inline-flex min-h-11 items-center rounded-md bg-ink-blue px-5 text-[15px] font-semibold text-white hover:bg-ink-blue-deep"
          >
            Start my RTI
          </button>
        </div>
      ) : (
        <div className="border border-[#cdbf9f] bg-card shadow-[0_2px_0_#ece3d1,0_20px_40px_rgba(28,25,23,0.08)]">
          <div aria-hidden="true" className={"hidden border-b-2 border-ink xl:grid " + COLUMNS}>
            {["No.", "Application", "Filed on", "Registration no.", "Deadline", ""].map((heading, index) => (
              <span key={index} className={"paper-label px-3.5 py-3 text-brown " + (index === 1 ? "px-5" : "")}>
                {heading}
              </span>
            ))}
          </div>
          <ol aria-label="Your applications">
            {rtis.map((rti, index) => (
              <RtiRow
                key={rti.key}
                // The oldest is No. 1, so a number stays with its application as new ones arrive.
                n={rtis.length - index}
                rti={rti}
                onUpdate={onUpdate}
                onDelete={() => onDelete(rti.key)}
                onAnalyse={() => onAnalyse(rti)}
              />
            ))}
          </ol>
        </div>
      )}
      <p className="font-hand text-[19px] text-brown">Nothing here leaves your browser.</p>
    </PageContainer>
  );
}

function RtiRow({
  n,
  rti,
  onUpdate,
  onDelete,
  onAnalyse,
}: {
  n: number;
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
    <li className={"grid gap-4 border-b border-edge px-5 py-5 last:border-b-0 xl:gap-0 xl:p-0 " + COLUMNS}>
      <span className="hidden border-r-2 border-stamp/35 px-3.5 py-5 font-title text-[28px] font-bold leading-none text-ink-blue xl:block">
        {n}
      </span>
      <div className="min-w-0 xl:px-5 xl:py-5">
        <p className="font-title text-xl font-bold leading-none text-ink-blue xl:hidden">No. {n}</p>
        <h2 className="mt-1.5 font-serif text-[16.5px] font-semibold leading-snug text-ink xl:mt-0">{rti.title}</h2>
        <p className="mt-1 text-[13px] text-muted">
          Drafted {formatDate(new Date(rti.createdAt))} · {rti.requests.length} request
          {rti.requests.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Side by side in a block; two columns of the register on a wide screen. */}
      <div className="grid max-w-xl grid-cols-[150px_minmax(0,1fr)] gap-3 xl:contents">
        <label className="flex flex-col gap-1 xl:px-3.5 xl:py-5">
          <span className="text-xs font-medium text-ink-3 xl:sr-only">Filed on</span>
          <input
            type="date"
            max={today}
            value={rti.filedOn ?? ""}
            onChange={(e) => onUpdate({ ...rti, filedOn: e.target.value || undefined })}
            className="paper-field min-h-10 w-full px-2 text-sm"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 xl:px-3.5 xl:py-5">
          <span className="text-xs font-medium text-ink-3 xl:sr-only">Registration no.</span>
          <input
            type="text"
            maxLength={60}
            value={rti.registrationNo ?? ""}
            placeholder="From the portal's acknowledgement"
            onChange={(e) => onUpdate({ ...rti, registrationNo: e.target.value || undefined })}
            className="paper-field min-h-10 w-full px-2.5 font-mono text-[13px]"
          />
        </label>
      </div>

      <div className="xl:px-3.5 xl:py-5">
        <DeadlineStamp status={status} />
        <DeadlineNote status={status} />
      </div>

      <div className="flex flex-wrap gap-2 xl:flex-col xl:items-stretch xl:px-4 xl:py-5">
        <button type="button" onClick={onAnalyse} className={SMALL_BUTTON + " bg-ink-blue font-semibold text-white hover:bg-ink-blue-deep"}>
          <FileSearch size={15} />
          Analyse the reply
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyDraft}
            className={SMALL_BUTTON + " flex-1 border border-ink font-medium text-ink hover:bg-ink/5"}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copied" : "Copy draft"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Delete this application from this browser?")) onDelete();
            }}
            aria-label={`Delete "${rti.title}"`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-faint hover:bg-ink/5 hover:text-stamp"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </li>
  );
}

const shortDate = (date: Date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// The deadline as a date stamp. It repeats the sentence under it, so screen readers skip it.
function DeadlineStamp({ status }: { status: ReturnType<typeof deadlineStatus> }) {
  const [text, colour] =
    status.kind === "not-filed"
      ? ["Not filed", "text-muted"]
      : status.kind === "waiting"
        ? [`Reply due ${shortDate(status.replyDue)}`, "text-ink-blue"]
        : status.kind === "appeal-window"
          ? ["Reply overdue", "text-stamp"]
          : ["Appeal window closed", "text-brown"];
  return (
    <span aria-hidden="true" className={"date-stamp " + colour}>
      {text}
    </span>
  );
}

function DeadlineNote({ status }: { status: ReturnType<typeof deadlineStatus> }) {
  const base = "mt-2.5 text-[13.5px] leading-relaxed text-ink-2";
  if (status.kind === "not-filed") {
    return <p className={base}>Not filed yet. Add the date once you file it.</p>;
  }
  if (status.kind === "waiting") {
    return (
      <p className={base}>
        Reply due by {formatDate(status.replyDue)}
        {status.daysLeft === 0 ? " (today)" : ` (${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} left)`}.
      </p>
    );
  }
  if (status.kind === "appeal-window") {
    return (
      <p className={base}>
        The reply was due by {formatDate(status.replyDue)}. No reply yet? You can file a first appeal
        until {formatDate(status.appealUntil)} ({status.daysLeft} day{status.daysLeft === 1 ? "" : "s"}{" "}
        left).
      </p>
    );
  }
  return (
    <p className={base}>
      The usual first-appeal window closed on {formatDate(status.appealUntil)}. An appeal can still
      be filed late with reasons for the delay.
    </p>
  );
}
