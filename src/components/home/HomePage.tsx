import {
  ArrowRight,
  BookOpen,
  Eye,
  FileSearch,
  Files,
  FlaskConical,
  Gavel,
  MapPin,
  Scale,
  type LucideIcon,
} from "lucide-react";
import { PROBLEMS, REPAIR_STARTER } from "./problems";

// Section 2(j) of the RTI Act: what a citizen can ask for.
const RIGHTS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Files,
    title: "Copies of records",
    text: "Work orders, bills, measurement books, inspection reports.",
  },
  {
    icon: Eye,
    title: "Inspect the work",
    text: "See the road work and its files yourself, with an official.",
  },
  {
    icon: FlaskConical,
    title: "Certified samples",
    text: "Take sealed samples of the material actually used.",
  },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MapPin,
    title: "Describe the problem",
    text: "In your own words, with a photo and a pin on the map if you like.",
  },
  {
    icon: BookOpen,
    title: "Get a precise RTI application",
    text: "The AI asks for the exact records PWD must keep, citing the CPWD Works Manual, in English or Hindi.",
  },
  {
    icon: Gavel,
    title: "Pass the officer check",
    text: "We read your application the way a reluctant officer would, and help you fix every easy excuse to refuse it.",
  },
  {
    icon: FileSearch,
    title: "Check the reply, then appeal",
    text: "Upload the reply: see what was answered, dodged or refused, and get a first appeal drafted.",
  },
];

export default function HomePage({
  onStart,
  onAnalyse,
}: {
  onStart: (starter?: string) => void;
  onAnalyse: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6 sm:px-6">
      <section className="flex flex-col gap-3 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Right to Information Act, 2005 · PWD Delhi
        </p>
        <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
          Complaint ignored? Make them answer.
        </h1>
        <p className="text-[15px] text-slate-600">
          RTI Copilot turns a civic problem into an RTI application that asks for the exact
          records the department must keep, reads the reply you get back, and drafts your appeal
          if it falls short. You stay in control: you file it yourself.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => onStart()}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Start my RTI
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            onClick={onAnalyse}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            <Scale size={14} />I got a reply
          </button>
        </div>
      </section>

      <section aria-labelledby="problems-heading" className="flex flex-col gap-3">
        <h2 id="problems-heading" className="text-sm font-medium text-slate-900">
          What's the problem?
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROBLEMS.map(({ label, icon: Icon, starter }) => (
            <button
              key={label}
              type="button"
              onClick={() => onStart(starter)}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 text-left text-sm font-medium text-slate-800 hover:border-slate-400"
            >
              <Icon size={18} className="shrink-0 text-slate-500" />
              {label}
            </button>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="rights-heading"
        className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-5"
      >
        <div className="flex flex-col gap-1">
          <h2 id="rights-heading" className="text-sm font-medium text-slate-900">
            RTI is more than photocopies
          </h2>
          <p className="text-[13px] text-slate-600">
            Section 2(j) of the Act lets you ask for all three. Papers can say anything; the road
            can&apos;t.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {RIGHTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-2 rounded-md bg-slate-50 p-3">
              <Icon size={16} className="mt-0.5 shrink-0 text-emerald-700" />
              <span>
                <span className="block text-sm font-medium text-slate-900">{title}</span>
                <span className="block text-[13px] text-slate-600">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => onStart(REPAIR_STARTER)}
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
        >
          A repair broke again? Start with an inspection
          <ArrowRight size={14} />
        </button>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-3">
        <h2 id="how-heading" className="text-sm font-medium text-slate-900">
          How it works
        </h2>
        <ol className="flex flex-col gap-3">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
                <Icon size={15} />
              </span>
              <span>
                <span className="block text-sm font-medium text-slate-900">
                  {index + 1}. {title}
                </span>
                <span className="block text-[13px] text-slate-600">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

    </main>
  );
}
