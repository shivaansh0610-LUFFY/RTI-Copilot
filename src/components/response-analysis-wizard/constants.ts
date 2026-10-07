import type { ClassificationLabel, InformationRequest } from "../../types";

export type StepId = "upload" | "align" | "classify" | "summary";

export function getCaseStatus(
  step: StepId,
  isProcessing: boolean,
  processingFailed: boolean,
): string {
  if (step === "upload") {
    if (processingFailed) return "PROCESSING_FAILED";
    if (isProcessing) return "PROCESSING";
    return "RESPONSE_UPLOADED";
  }
  if (step === "align" || step === "classify") return "ANALYSIS_READY";
  return "COMPLETED";
}

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
// offered a follow-up RTI for them (pre-selected on the summary step).
export const FOLLOW_UP_LABELS: ClassificationLabel[] = [
  "PARTIALLY_RESPONSIVE",
  "NON_RESPONSIVE",
  "NO_RECORD_STATED",
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

export const LABEL_BADGE_CLASSES: Record<ClassificationLabel, string> = {
  RESPONSIVE: "bg-green-50 text-green-700",
  PARTIALLY_RESPONSIVE: "bg-amber-50 text-amber-700",
  NON_RESPONSIVE: "bg-red-50 text-red-700",
  NO_RECORD_STATED: "bg-red-50 text-red-700",
  EXEMPTION_CLAIMED: "bg-gray-50 text-gray-600",
  TRANSFERRED: "bg-gray-50 text-gray-600",
  FEE_DEMANDED: "bg-gray-50 text-gray-600",
  ATTACHMENT_REFERENCED: "bg-gray-50 text-gray-600",
  INSUFFICIENT_EVIDENCE: "bg-gray-50 text-gray-600",
};
