export type StepId =
  | "describe"
  | "clarify"
  | "requests"
  | "quality-review"
  | "draft";

// There is no "already public?" step: its mock marked a request public with a made-up
// citation, and a false "already public" sends a citizen away with nothing.
export const ALL_STEPS: { id: StepId; label: string }[] = [
  { id: "describe", label: "Describe" },
  { id: "clarify", label: "Clarify" },
  { id: "requests", label: "Requests" },
  { id: "quality-review", label: "Quality review" },
  { id: "draft", label: "Draft" },
];

export const CASE_STATUS: Record<StepId, string> = {
  describe: "GRIEVANCE_CAPTURED",
  clarify: "CLARIFICATION_REQUIRED",
  requests: "REQUESTS_GENERATED",
  "quality-review": "REQUESTS_GENERATED",
  draft: "DRAFT_READY",
};

// Matches the mock clarify questions' default period options in mocks.ts and
// app/services/drafting/mock.py — keep all three in sync.
export const PERIOD_OPTIONS = [
  "Last 6 months",
  "Last 1 year",
  "Last 2 years",
  "More than 2 years",
];
