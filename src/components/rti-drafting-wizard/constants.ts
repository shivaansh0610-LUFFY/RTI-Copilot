export type StepId =
  | "describe"
  | "clarify"
  | "requests"
  | "check"
  | "applicant-details"
  | "draft";

// There is no "already public?" step: its mock marked a request public with a made-up
// citation, and a false "already public" sends a citizen away with nothing. The officer check
// runs on every application (it replaced the "quality review" that only vague requests got).
export const ALL_STEPS: { id: StepId; label: string }[] = [
  { id: "describe", label: "Describe" },
  { id: "clarify", label: "Clarify" },
  { id: "requests", label: "Requests" },
  { id: "check", label: "Officer check" },
  { id: "applicant-details", label: "Your details" },
  { id: "draft", label: "Draft" },
];

// Matches the mock clarify questions' default period options in mocks.ts and
// app/services/drafting/mock.py — keep all three in sync.
export const PERIOD_OPTIONS = [
  "Last 6 months",
  "Last 1 year",
  "Last 2 years",
  "More than 2 years",
];

// Matches RECORD_TYPES_SEPARATOR in app/services/drafting/mock.py: how a multi-select
// question's chosen options are joined into the single string answer.
export const MULTI_SELECT_SEPARATOR = "; ";

// Matches RECORD_TYPES_KEY in app/services/drafting/mock.py.
export const RECORD_TYPES_KEY = "recordTypes";
