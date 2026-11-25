import { Check, FilePenLine, FileSearch, ListChecks, ShieldCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import "./paper.css";

// The pieces every page after the home page shares, in the home page's look: paper, ink blue,
// chapter-style titles in Khand, one width, one header, one footer.

export function PageContainer({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pb-20 pt-6 sm:px-8">{children}</main>;
}

// A small label, a big chapter title (its `accent` words in ink blue) and an intro.
export function PageHeader({
  eyebrow,
  title,
  accent,
  intro,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  intro?: ReactNode;
}) {
  const at = accent ? title.lastIndexOf(accent) : -1;
  return (
    <header className="flex flex-col pt-2 sm:pt-6">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-brown sm:text-[12.5px]">
        {eyebrow}
      </p>
      <h1 className="mt-2 font-title text-[44px] font-bold uppercase leading-[0.9] text-ink sm:text-[64px] lg:text-[76px]">
        {at < 0 || !accent ? (
          title
        ) : (
          <>
            {title.slice(0, at)}
            <span className="text-ink-blue">{accent}</span>
            {title.slice(at + accent.length)}
          </>
        )}
      </h1>
      {intro && <p className="mt-4 max-w-[42em] text-[15.5px] leading-relaxed text-ink-2 sm:text-[17px]">{intro}</p>}
    </header>
  );
}

// A wizard's current step, straight on the page: StepCardBody, then StepCardActions (the Back /
// Continue bar under a rule). Steps that are a form stay at reading width; `wide` ones (a sheet
// with notes beside it) use the whole page.
export function StepCard({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <section className={"flex w-full flex-col " + (wide ? "" : "max-w-3xl")}>{children}</section>;
}

export function StepCardBody({ children }: { children: ReactNode }) {
  return <div className="flex-1">{children}</div>;
}

export function StepCardActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-5">{children}</div>
  );
}

// The steps as a ruled line, as in a ledger: done in ink blue, the current one in stamp red. On
// a phone only the numbers show: the page's eyebrow already names the current step.
export function StepProgress({
  steps,
  currentId,
}: {
  steps: { id: string; label: string }[];
  currentId: string;
}) {
  const currentIndex = steps.findIndex((step) => step.id === currentId);
  return (
    <ol className="flex border-t-2 border-[#cdbf9f]" aria-label="Progress">
      {steps.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li
            key={step.id}
            className="relative flex min-w-0 flex-1 flex-col gap-1 pt-3"
            aria-current={isCurrent ? "step" : undefined}
          >
            <span
              aria-hidden="true"
              className={
                "absolute -top-[3px] left-0 right-2.5 h-1 " +
                (isDone ? "bg-ink-blue" : isCurrent ? "bg-stamp" : "")
              }
            />
            <span
              className={
                "font-title text-2xl font-bold leading-none sm:text-[28px] " +
                (isDone ? "text-ink-blue" : isCurrent ? "text-stamp" : "text-[#b8ad98]")
              }
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className={
                "hidden items-center gap-1 truncate text-[13.5px] sm:flex " +
                (isCurrent ? "font-semibold text-ink" : isDone ? "font-medium text-ink-3" : "font-medium text-muted")
              }
            >
              {isDone && <Check size={13} strokeWidth={3} className="shrink-0 text-ink-blue" />}
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export type View = "home" | "drafting" | "review" | "analysis" | "rtis";

const NAV: { view: Exclude<View, "home">; icon: LucideIcon; short: string; full: string }[] = [
  { view: "drafting", icon: FilePenLine, short: "Draft", full: "Draft your RTI" },
  { view: "review", icon: ShieldCheck, short: "Check", full: "Check a draft" },
  { view: "analysis", icon: FileSearch, short: "Reply", full: "Analyse the reply" },
  { view: "rtis", icon: ListChecks, short: "My RTIs", full: "My RTIs" },
];

// The folder-and-tick of the favicon.
function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 28" fill="none" className="h-[22px] w-[22px] shrink-0 sm:h-7 sm:w-7">
      <path
        d="M3 7.5a2 2 0 0 1 2-2h5.2l2.3 2.6H23a2 2 0 0 1 2 2V21a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        stroke="#1F3A8A"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m9.5 15.4 3 3 6-6.2" stroke="#B0893F" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SiteHeader({
  view,
  rtiCount,
  onNavigate,
}: {
  view: View;
  rtiCount: number;
  onNavigate: (view: View) => void;
}) {
  return (
    <header className="sticky top-0 z-[1000] border-b border-[#e0d5be] bg-paper/95 backdrop-blur">
      {/* As wide as the page under it, so the logo lines up with the page's left edge. */}
      <div
        className={
          "mx-auto flex min-h-14 items-center justify-between gap-2 sm:min-h-16 " +
          (view === "home" ? "max-w-[1376px] px-[clamp(12px,2.5vw,32px)]" : "max-w-6xl px-3 sm:px-8")
        }
      >
        <button
          type="button"
          onClick={() => onNavigate("home")}
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-serif text-[15px] font-semibold text-ink sm:gap-2.5 sm:text-[19px]"
        >
          <Logo />
          RTI Copilot
        </button>
        <nav aria-label="Main" className="flex gap-0.5 sm:gap-1">
          {NAV.map(({ view: target, icon: Icon, short, full }) => {
            const count = target === "rtis" && rtiCount > 0 ? ` (${rtiCount})` : "";
            const active = view === target;
            return (
              <button
                key={target}
                type="button"
                onClick={() => onNavigate(target)}
                aria-label={full + count}
                aria-current={active ? "page" : undefined}
                className={
                  "flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[13px] font-medium transition-colors sm:min-h-10 sm:px-3.5 sm:text-[14.5px] " +
                  (active ? "bg-ink-blue text-white" : "text-ink-3 hover:bg-ink/5")
                }
              >
                <Icon size={16} className="hidden lg:block" />
                <span className="sm:hidden">{short + count}</span>
                <span className="hidden sm:inline">{full + count}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[#e0d5be] bg-paper-deep">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-[13.5px] leading-relaxed text-ink-3 sm:flex-row sm:justify-between sm:gap-10 sm:px-8">
        <div className="flex max-w-[52em] flex-col gap-2">
          <p>
            RTI Copilot is an independent citizen tool: not a government website, and not run by
            PWD Delhi. It is an assistant, not legal advice: read every draft before you file it.
            It never files on your behalf or asks for portal passwords. Your photo stays on your
            device; your description is sent to the AI service that writes the drafts.
          </p>
          <p className="text-muted">Right to Information Act, 2005 · Public Works Department, Government of NCT of Delhi</p>
        </div>
        <p className="shrink-0 font-serif font-semibold text-ink">RTI Copilot</p>
      </div>
    </footer>
  );
}
