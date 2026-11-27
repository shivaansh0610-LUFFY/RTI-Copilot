import type {
  ClarifyResult,
  DraftLanguage,
  DraftResult,
  InformationRequest,
  PreflightResult,
} from "../../types";
import { MULTI_SELECT_SEPARATOR, PERIOD_OPTIONS, RECORD_TYPES_KEY } from "./constants";
import { checkLocally } from "./preflight";
import { apiFetch } from "../../apiFetch";

// Backend calls — each is a single async function. The ones still mocked are a
// one-line swap for a real API call later: replace the body, keep the signature.

export const DEFAULT_AUTHORITY = "Public Works Department (PWD), Ward Division Office";

// Matches RECORD_TYPE_REQUESTS in app/services/drafting/mock.py -- keep both in sync.
const RECORD_TYPE_REQUESTS: Record<string, { category: string; title: string; quality: "good" | "needs-detail" }> = {
  "Work order for repair": {
    category: "Work order",
    title: "Copy of the work order sanctioning repair of the road",
    quality: "good",
  },
  "Budget/expenditure details": {
    category: "Expenditure",
    title: "Details of amount spent",
    quality: "needs-detail",
  },
  "Inspection report": {
    category: "Inspection report",
    title: "Copy of the most recent inspection/quality-check report for the road",
    quality: "good",
  },
  "Correspondence regarding the issue": {
    category: "Correspondence",
    title: "Copies of correspondence exchanged regarding this issue",
    quality: "good",
  },
};

// Matches _PERIOD_MENTION in app/services/drafting/mock.py.
const PERIOD_MENTION = /\b(?:since|for|over)\s+(?:the\s+)?(?:last|past)?\s*(\d+)\s*(day|week|month|year)s?\b|\b(\d+)\s*(day|week|month|year)s?\s+ago\b/i;

// Matches _AUTHORITY_MENTION in app/services/drafting/mock.py.
const AUTHORITY_MENTION =
  /\b(PWD|Public Works Department|MCD|Municipal Corporation(?: of Delhi)?|NDMC|New Delhi Municipal Council|DJB|Delhi Jal Board|DDA|Delhi Development Authority)\b/i;

// Matches _RECORD_TYPE_KEYWORDS in app/services/drafting/mock.py.
const RECORD_TYPE_KEYWORDS: Record<string, string[]> = {
  "Work order for repair": ["work order", "contractor", "sanction", "tender", "awarded", "repair work"],
  "Budget/expenditure details": ["cost", "spent", "expenditure", "budget", "fund", "money", "rupees"],
  "Inspection report": ["inspect", "quality", "survey", "assess", "check"],
  "Correspondence regarding the issue": [
    "complaint", "complained", "letter", "reply", "replied", "email", "correspond", "response", "contacted",
  ],
};

function detectedPeriod(grievance: string): string | undefined {
  const match = PERIOD_MENTION.exec(grievance);
  if (!match) return undefined;
  const number = Number(match[1] ?? match[3]);
  const unit = (match[2] ?? match[4]).toLowerCase();
  const months = { day: number / 30, week: (number * 7) / 30, month: number, year: number * 12 }[unit] ?? 0;
  if (months <= 6) return "Last 6 months";
  if (months <= 12) return "Last 1 year";
  if (months <= 24) return "Last 2 years";
  return "More than 2 years";
}

function mentions(grievance: string, keywords: string[]): boolean {
  return keywords.some((keyword) => new RegExp(`\\b${keyword}\\b`, "i").test(grievance));
}

function relevantRecordTypes(grievance: string): string[] {
  const matched = Object.entries(RECORD_TYPE_KEYWORDS)
    .filter(([, keywords]) => mentions(grievance, keywords))
    .map(([recordType]) => recordType);
  return matched.length > 0 ? matched : Object.keys(RECORD_TYPE_REQUESTS);
}

// Unset means "run on the built-in mock data without the backend".
const API_URL: string | undefined = import.meta.env.VITE_API_URL;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await apiFetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with status ${response.status}`);
  }
  return response.json();
}

// POST /geocode. Browser-only demo mode (no VITE_API_URL) can't reverse-geocode for real.
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | undefined> {
  if (!API_URL) return undefined;
  const { address } = await postJson<{ address: string }>("/geocode", { latitude, longitude });
  return address;
}

// POST /cases. The returned caseId threads through getClarifyQuestions, decomposeGrievance
// and generateDraft below, since their real endpoints are case-scoped.
export async function createCase(grievance: string): Promise<string | undefined> {
  if (!API_URL) return undefined;
  const { caseId } = await postJson<{ caseId: string }>("/cases", { grievanceText: grievance });
  return caseId;
}

// POST /cases/:id/clarify-questions. `grievance` is only used by the built-in mock (the real
// endpoint already has it, keyed by caseId) to decide, from its own wording, what's worth asking.
export async function getClarifyQuestions(caseId: string | undefined, grievance: string): Promise<ClarifyResult> {
  if (API_URL && caseId) {
    return postJson<ClarifyResult>(`/cases/${caseId}/clarify-questions`, {});
  }

  // Matches mock.generate_clarify_result in app/services/drafting/mock.py: not a model, so this
  // reads the grievance with plain keyword/pattern checks rather than understanding it -- but it
  // does read it, rather than always asking the same fixed questions regardless of content.
  const answers: Record<string, string> = {};
  const questions: ClarifyResult["questions"] = [];

  const period = detectedPeriod(grievance);
  if (period) {
    answers.period = period;
  } else {
    questions.push({ key: "period", question: "What time period does this relate to?", options: PERIOD_OPTIONS });
  }

  if (AUTHORITY_MENTION.test(grievance)) {
    answers.knowsAuthority = "Yes, I know the department";
  } else {
    questions.push({
      key: "knowsAuthority",
      question: "Do you know which government department is responsible?",
      options: ["Yes, I know the department", "No, not sure"],
    });
  }

  questions.push({
    key: RECORD_TYPES_KEY,
    question: "What type of record are you seeking?",
    options: relevantRecordTypes(grievance),
    multi: true,
  });

  return { answers, questions };
}

// POST /cases/:id/decompose
export async function decomposeGrievance(
  caseId: string | undefined,
  clarification: Record<string, string>,
): Promise<InformationRequest[]> {
  if (API_URL && caseId) {
    return postJson<InformationRequest[]>(`/cases/${caseId}/decompose`, { clarification });
  }

  const period = clarification.period ?? "Last 1 year";
  const chosen = (clarification[RECORD_TYPES_KEY] ?? "")
    .split(MULTI_SELECT_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part in RECORD_TYPE_REQUESTS);
  // No record-type question was asked (e.g. a follow-up skips Clarify) -- keep the old,
  // unconditional set of three so that path is unaffected.
  const types = chosen.length > 0 ? chosen : Object.keys(RECORD_TYPE_REQUESTS).slice(0, 3);

  return types.map((recordType, index) => ({
    id: `RQ-${String(index + 1).padStart(3, "0")}`,
    ...RECORD_TYPE_REQUESTS[recordType],
    authority: DEFAULT_AUTHORITY,
    period,
    source: "generated",
  }));
}

// Replace with: POST /cases/:id/requests
export async function createCustomRequest(
  title: string,
  category: string,
  authority: string | undefined,
  period: string,
): Promise<InformationRequest> {
  const wordCount = title.trim().split(/\s+/).length;
  return {
    id: `RQ-C${Date.now().toString(36).toUpperCase()}`,
    category: category.trim() || "Other",
    title: title.trim(),
    authority: authority ?? DEFAULT_AUTHORITY,
    period,
    quality: wordCount >= 6 ? "good" : "needs-detail",
    source: "custom",
  };
}

// POST /cases/:id/preflight: the officer check. Without a backend, the same fixed rules run here.
export async function runPreflight(
  requests: InformationRequest[],
  caseId: string | undefined,
): Promise<PreflightResult> {
  if (API_URL && caseId) {
    return postJson<PreflightResult>(`/cases/${caseId}/preflight`, { requests });
  }
  return checkLocally(requests);
}

// POST /cases/:id/draft. The built-in mock ignores `language` and writes English.
export async function generateDraft(
  requests: InformationRequest[],
  caseId?: string,
  language: DraftLanguage = "en",
): Promise<DraftResult> {
  if (API_URL && caseId) {
    return postJson<DraftResult>(`/cases/${caseId}/draft`, { requests, language });
  }

  const draftText = requests
    .map(
      (request) => `Subject: Application under the Right to Information Act, 2005 — ${request.category}
Authority: ${request.authority}
Particulars of information sought: ${request.title}
Period: ${request.period}
${request.context ? `Background: ${request.context}\n` : ""}`,
    )
    .join("\n---\n\n");
  const flaggedRequestIds = requests
    .filter((request) => request.title.trim().split(/\s+/).length < 6)
    .map((request) => request.id);
  return {
    draftText,
    charCount: draftText.length,
    overLimit: draftText.length > 3000,
    flaggedRequestIds,
  };
}
