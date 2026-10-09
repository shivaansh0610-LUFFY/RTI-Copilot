export interface InformationRequest {
  id: string; // e.g. "RQ-001"
  category: string; // e.g. "Work order"
  title: string;
  authority: string;
  period: string;
  quality: "good" | "needs-detail";
  source?: "generated" | "custom" | "follow-up";
  context?: string; // why this is being asked, e.g. what an earlier reply left out
  publiclyAvailable?: boolean;
  publicSource?: PublicSource; // where the information was found, when publiclyAvailable
}

export interface PublicSource {
  title: string;
  url: string;
}

export interface DraftResult {
  draftText: string;
  charCount: number;
  overLimit: boolean;
  warning?: string;
  flaggedRequestIds: string[];
}

// Hand-off from the Response Analysis Wizard to the RTI Drafting Wizard when
// the authority did not fully answer the original application.
export interface FollowUpContext {
  originalAuthority: string;
  requests: InformationRequest[];
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
