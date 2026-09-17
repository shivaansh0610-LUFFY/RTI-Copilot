import { Check } from "lucide-react";
import type { InformationRequest } from "../../types";
import type { StepId } from "./constants";

export function StepProgressBar({
  steps,
  currentStepId,
}: {
  steps: { id: StepId; label: string }[];
  currentStepId: StepId;
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);
  return (
    <div className="flex items-center">
      {steps.map((step, index) => {
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
            {index < steps.length - 1 && (
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

export function CategoryBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
      {children}
    </span>
  );
}

export function QualityBadge({ quality }: { quality: InformationRequest["quality"] }) {
  return quality === "good" ? (
    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
      Good detail
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      Needs detail
    </span>
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

export function RequestCard({
  request,
  rightSlot,
}: {
  request: InformationRequest;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CategoryBadge>{request.category}</CategoryBadge>
        <QualityBadge quality={request.quality} />
        {rightSlot}
      </div>
      <p className="text-sm font-medium text-slate-900">{request.title}</p>
      <p className="mt-1 text-xs text-slate-500">
        {request.authority} &middot; {request.period}
      </p>
    </div>
  );
}
