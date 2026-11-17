export interface InformationRequest {
  id: string; // e.g. "RQ-001"
  category: string; // e.g. "Work order"
  title: string;
  authority: string;
  period: string;
  quality: "good" | "needs-detail";
  // "inspection": a Section 2(j) request to inspect the work or take samples, worded by the app.
  source?: "generated" | "custom" | "follow-up" | "inspection";
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

// The officer check (POST /cases/:id/preflight). Mirrors app/schemas/preflight.py.
export type PreflightCode =
  | "QUESTION_NOT_RECORD"
  | "CREATES_NEW_INFO"
  | "TOO_VAGUE"
  | "TOO_BROAD"
  | "PERSONAL_INFO"
  | "NO_PLACE";

export interface PreflightIssue {
  code: PreflightCode;
  officerSays: string; // what a reluctant PIO could reply
  why: string;
  section: string; // e.g. "Section 2(f)"
  fix: string;
}

export interface PreflightItem {
  requestId: string;
  issues: PreflightIssue[];
  suggestedTitle?: string; // a better title from the AI, only when there are issues
}

export interface PreflightResult {
  items: PreflightItem[];
  aiUsed: boolean; // false when only the fixed rules ran
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

// Hand-off from the RTI Drafting Wizard to the Response Analysis Wizard: the case whose
// requests were just drafted. caseId is undefined when the app runs without a backend.
export interface FiledCase {
  caseId?: string;
  requests: InformationRequest[];
  // Set when the drafting wizard hands it over, for the "My RTIs" list.
  grievance?: string;
  draftText?: string;
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
