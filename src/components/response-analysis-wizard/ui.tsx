import { Check } from "lucide-react";
import type { StepId } from "./constants";

const STEP_LABELS: { id: StepId; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "align", label: "Alignment" },
  { id: "classify", label: "Classification" },
  { id: "review", label: "Review" },
  { id: "summary", label: "Summary" },
];

export function StepProgressBar({ currentStepId }: { currentStepId: StepId }) {
  const currentIndex = STEP_LABELS.findIndex((s) => s.id === currentStepId);
  return (
    <div className="flex items-center">
      {STEP_LABELS.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <div key={step.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium " +
                  (isCompleted
                    ? "bg-slate-900 text-white"
                    : isCurrent
                      ? "border-2 border-slate-900 text-slate-900"
                      : "border border-slate-300 text-slate-400")
                }
              >
                {isCompleted ? <Check size={14} /> : index + 1}
              </div>
              <span
                className={
                  "whitespace-nowrap text-[11px] " +
                  (isCurrent ? "font-medium text-slate-900" : "text-slate-400")
                }
              >
                {step.label}
              </span>
            </div>
            {index < STEP_LABELS.length - 1 && (
              <div
                className={"mx-2 h-px flex-1 " + (isCompleted ? "bg-slate-900" : "bg-slate-200")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={
        "inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 " +
        className
      }
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={
        "inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 " +
        className
      }
    />
  );
}
