import { Check, FilePenLine, FileSearch, ListChecks, Scale, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// The pieces every page shares, in the style of the home page: one width, one header, one
// footer, and the same small label + big title + intro at the top of each page.

export function PageContainer({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">{children}</main>;
}

export function PageHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2 pt-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{eyebrow}</p>
      <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">{title}</h1>
      {intro && <p className="text-[15px] text-slate-600">{intro}</p>}
    </header>
  );
}

// The white card a wizard's current step sits in: StepCardBody, then StepCardActions (the Back /
// Continue bar underneath).
export function StepCard({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-h-[360px] flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      {children}
    </section>
  );
}

export function StepCardBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 p-4 sm:p-6">{children}</div>;
}

export function StepCardActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4">{children}</div>;
}

// Numbered circles joined by lines. On a phone only the circles show: the page's eyebrow
// already names the current step, and five labels do not fit in 390 px.
export function StepProgress({
  steps,
  currentId,
}: {
  steps: { id: string; label: string }[];
  currentId: string;
}) {
  const currentIndex = steps.findIndex((step) => step.id === currentId);
  return (
    <ol className="flex items-center" aria-label="Progress">
      {steps.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li
            key={step.id}
            className="flex flex-1 items-center last:flex-none"
            aria-current={isCurrent ? "step" : undefined}
          >
            <div className="flex flex-col items-center gap-1">
              <span
                className={
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium " +
                  (isDone
                    ? "bg-slate-900 text-white"
                    : isCurrent
                      ? "border-2 border-slate-900 bg-white text-slate-900"
                      : "border border-slate-300 bg-white text-slate-400")
                }
              >
                {isDone ? <Check size={14} /> : index + 1}
              </span>
              <span
                className={
                  "hidden whitespace-nowrap text-[11px] sm:block " +
                  (isCurrent ? "font-medium text-slate-900" : "text-slate-400")
                }
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={"mx-2 h-px flex-1 sm:mb-5 " + (isDone ? "bg-slate-900" : "bg-slate-200")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export type View = "home" | "drafting" | "analysis" | "rtis";

const NAV: { view: Exclude<View, "home">; icon: LucideIcon; short: string; full: string }[] = [
  { view: "drafting", icon: FilePenLine, short: "Draft", full: "Draft your RTI" },
  { view: "analysis", icon: FileSearch, short: "Reply", full: "Analyse the reply" },
  { view: "rtis", icon: ListChecks, short: "My RTIs", full: "My RTIs" },
];

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
    <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => onNavigate("home")}
          className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-900"
        >
          <Scale size={16} />
          RTI Copilot
        </button>
        <nav aria-label="Main" className="flex gap-1">
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
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium sm:px-3 " +
                  (active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")
                }
              >
                <Icon size={15} className="hidden sm:block" />
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
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:px-6">
        <p>
          RTI Copilot is an assistant, not legal advice: read every draft before you file it. It
          never files on your behalf or asks for portal passwords. Your photo stays on your device;
          your description is sent to the AI service that writes the drafts.
        </p>
        <p>Right to Information Act, 2005 · Public Works Department, Government of NCT of Delhi</p>
      </div>
    </footer>
  );
}
