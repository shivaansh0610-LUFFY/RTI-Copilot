export interface InformationRequest {
  id: string; // e.g. "RQ-001"
  category: string; // e.g. "Work order"
  title: string;
  authority: string;
  period: string;
  quality: "good" | "needs-detail";
  publiclyAvailable?: boolean;
}

export interface ResponsePassage {
  id: string;
  page: number;
  paragraph: number;
  text: string;
}

export type ClassificationLabel =
  | "RESPONSIVE"
  | "PARTIALLY_RESPONSIVE"
  | "NON_RESPONSIVE"
  | "NO_RECORD_STATED"
  | "EXEMPTION_CLAIMED"
  | "TRANSFERRED"
  | "FEE_DEMANDED"
  | "ATTACHMENT_REFERENCED"
  | "INSUFFICIENT_EVIDENCE";

export interface ClassificationResult {
  requestId: string;
  label: ClassificationLabel;
  explanation: string;
  evidence: ResponsePassage[];
  abstentionReason?: string; // required when label === "INSUFFICIENT_EVIDENCE"
}

export type ReviewVerdict = "agree" | "disagree" | "evidence-incorrect";
