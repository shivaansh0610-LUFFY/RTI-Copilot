import type { ClassificationLabel, InformationRequest } from "../../types";

export type StepId = "upload" | "align" | "classify" | "summary";

export const ANALYSIS_STEPS: { id: StepId; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "align", label: "Matching" },
  { id: "classify", label: "Findings" },
  { id: "summary", label: "Next steps" },
];

// The requests originally filed in the RTI application (source of truth from
// Part A). Standalone default data so this component works without props.
export const MOCK_ORIGINAL_REQUESTS: InformationRequest[] = [
  {
    id: "RQ-001",
    category: "Work order",
    title: "Copy of the work order sanctioning repair of the road",
    authority: "Public Works Department (PWD), Ward Division Office",
    period: "Last 1 year",
    quality: "good",
  },
  {
    id: "RQ-002",
    category: "Expenditure",
    title: "Details of amount spent on the road repair project",
    authority: "Public Works Department (PWD), Ward Division Office",
    period: "Last 1 year",
    quality: "good",
  },
  {
    id: "RQ-003",
    category: "Inspection report",
    title: "Copy of the most recent inspection/quality-check report for the road",
    authority: "Public Works Department (PWD), Ward Division Office",
    period: "Last 1 year",
    quality: "good",
  },
  {
    id: "RQ-004",
    category: "Contract",
    title: "Copy of the contractor agreement for the road repair work",
    authority: "Public Works Department (PWD), Ward Division Office",
    period: "Last 1 year",
    quality: "good",
  },
  {
    id: "RQ-005",
    category: "Correspondence",
    title: "Copies of certified photocopies of the above records",
    authority: "Public Works Department (PWD), Ward Division Office",
    period: "Last 1 year",
    quality: "good",
  },
  {
    id: "RQ-006",
    category: "Surveillance",
    title: "List of CCTV footage available near the work site during construction",
    authority: "Public Works Department (PWD), Ward Division Office",
    period: "Last 1 year",
    quality: "good",
  },
];

export const LABEL_TEXT: Record<ClassificationLabel, string> = {
  RESPONSIVE: "Responsive",
  PARTIALLY_RESPONSIVE: "Partially responsive",
  NON_RESPONSIVE: "Non-responsive",
  NO_RECORD_STATED: "No record stated",
  EXEMPTION_CLAIMED: "Exemption claimed",
  TRANSFERRED: "Transferred",
  FEE_DEMANDED: "Fee demanded",
  ATTACHMENT_REFERENCED: "Attachment referenced",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
};

// Outcomes where the information was not actually provided, so the citizen is
// offered a first appeal or a follow-up RTI for them (pre-selected on the summary step).
// A refusal under an exemption is a classic ground for a first appeal.
export const FOLLOW_UP_LABELS: ClassificationLabel[] = [
  "PARTIALLY_RESPONSIVE",
  "NON_RESPONSIVE",
  "NO_RECORD_STATED",
  "EXEMPTION_CLAIMED",
  "INSUFFICIENT_EVIDENCE",
];

// What the citizen should do for outcomes that don't call for a fresh request.
export const NEXT_STEP_HINT: Partial<Record<ClassificationLabel, string>> = {
  RESPONSIVE: "Answered — no action needed.",
  ATTACHMENT_REFERENCED: "Check the referenced attachment was enclosed with the reply.",
  FEE_DEMANDED: "Pay the additional fee to receive the information.",
  EXEMPTION_CLAIMED: "Consider a First Appeal if the exemption seems unjustified.",
  TRANSFERRED: "Wait for a reply from the authority it was transferred to.",
};

// How each finding is marked: green answered, amber partly answered, red refused or dodged,
// grey for a next step that is neither (a fee, a transfer, an attachment, or no clear answer).
export type LabelTone = "good" | "part" | "bad" | "info";

export const LABEL_TONE: Record<ClassificationLabel, LabelTone> = {
  RESPONSIVE: "good",
  PARTIALLY_RESPONSIVE: "part",
  NON_RESPONSIVE: "bad",
  NO_RECORD_STATED: "bad",
  EXEMPTION_CLAIMED: "bad",
  TRANSFERRED: "info",
  FEE_DEMANDED: "info",
  ATTACHMENT_REFERENCED: "info",
  INSUFFICIENT_EVIDENCE: "info",
};
