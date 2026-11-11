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
  basis?: Citation; // the official passage showing this record should exist
}

export interface Citation {
  sourceTitle: string;
  url: string;
  page: number; // page of the PDF file
  quote: string;
}

export interface PublicSource {
  title: string;
  url: string;
}

export interface ClarifyQuestion {
  key: string;
  question: string;
  options: string[];
}

export interface ClarifyResult {
  // Extracted straight from the grievance, no need to ask (pre-filled into the answers).
  answers: Record<string, string>;
  // Only what's genuinely still missing. Can be empty if the grievance said everything needed.
  questions: ClarifyQuestion[];
}

export type DraftLanguage = "en" | "hi";

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

// Hand-off from the RTI Drafting Wizard to the Response Analysis Wizard: the case whose
// requests were just drafted. caseId is undefined when the app runs without a backend.
export interface FiledCase {
  caseId?: string;
  requests: InformationRequest[];
}

export interface ResponseAnalysis {
  pages: number;
  ocrUsed: boolean;
  passages: ResponsePassage[];
  results: ClassificationResult[];
}

export interface AppealItem {
  requestId: string;
  title: string;
  label: ClassificationLabel;
  explanation: string;
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
