export type StepId =
  | "describe"
  | "clarify"
  | "requests"
  | "public-check"
  | "quality-review"
  | "draft";

export const ALL_STEPS: { id: StepId; label: string }[] = [
  { id: "describe", label: "Describe" },
  { id: "clarify", label: "Clarify" },
  { id: "requests", label: "Requests" },
  { id: "public-check", label: "Public info" },
  { id: "quality-review", label: "Quality review" },
  { id: "draft", label: "Draft" },
];

export const CASE_STATUS: Record<StepId, string> = {
  describe: "GRIEVANCE_CAPTURED",
  clarify: "CLARIFICATION_REQUIRED",
  requests: "REQUESTS_GENERATED",
  "public-check": "REQUESTS_GENERATED",
  "quality-review": "REQUESTS_GENERATED",
  draft: "DRAFT_READY",
};

export const PERIOD_OPTIONS = [
  "Last 6 months",
  "Last 1 year",
  "Last 2 years",
  "More than 2 years",
];

export const AUTHORITY_OPTIONS = [
  { value: "yes", label: "Yes, I know the department" },
  { value: "no", label: "No, not sure" },
];
