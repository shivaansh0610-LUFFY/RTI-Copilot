import type { ClarifyResult, DraftResult, InformationRequest } from "../../types";
import { PERIOD_OPTIONS } from "./constants";

// Backend calls — each is a single async function. The ones still mocked are a
// one-line swap for a real API call later: replace the body, keep the signature.

const DEFAULT_AUTHORITY = "Public Works Department (PWD), Ward Division Office";

// Unset means "run on the built-in mock data without the backend".
const API_URL: string | undefined = import.meta.env.VITE_API_URL;

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with status ${response.status}`);
  }
  return response.json();
}

// POST /cases. The returned caseId threads through getClarifyQuestions, decomposeGrievance,
// checkPublicInfo and generateDraft below, since their real endpoints are case-scoped.
export async function createCase(grievance: string): Promise<string | undefined> {
  if (!API_URL) return undefined;
  const { caseId } = await postJson<{ caseId: string }>("/cases", { grievanceText: grievance });
  return caseId;
}

// POST /cases/:id/clarify-questions
export async function getClarifyQuestions(caseId: string | undefined): Promise<ClarifyResult> {
  if (API_URL && caseId) {
    return postJson<ClarifyResult>(`/cases/${caseId}/clarify-questions`, {});
  }

  return {
    answers: {},
    questions: [
      { key: "period", question: "What time period does this relate to?", options: PERIOD_OPTIONS },
      {
        key: "knowsAuthority",
        question: "Do you know which government department is responsible?",
        options: ["Yes, I know the department", "No, not sure"],
      },
    ],
  };
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
  const requests: InformationRequest[] = [
    {
      id: "RQ-001",
      category: "Work order",
      title: "Copy of the work order sanctioning repair of the road",
      authority: DEFAULT_AUTHORITY,
      period,
      quality: "good",
      source: "generated",
    },
    {
      id: "RQ-002",
      category: "Expenditure",
      title: "Details of amount spent",
      authority: DEFAULT_AUTHORITY,
      period,
      quality: "needs-detail",
      source: "generated",
    },
    {
      id: "RQ-003",
      category: "Inspection report",
      title: "Copy of the most recent inspection/quality-check report for the road",
      authority: DEFAULT_AUTHORITY,
      period,
      quality: "good",
      source: "generated",
    },
  ];
  return requests;
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

// POST /cases/:id/public-info-check
export async function checkPublicInfo(
  requests: InformationRequest[],
  caseId?: string,
): Promise<InformationRequest[]> {
  if (API_URL && caseId) {
    return postJson<InformationRequest[]>(`/cases/${caseId}/public-info-check`, { requests });
  }

  return requests.map((request) =>
    request.id === "RQ-001"
      ? {
          ...request,
          publiclyAvailable: true,
          publicSource: {
            title: "Central Public Procurement Portal — awarded tenders & work orders",
            url: "https://eprocure.gov.in/cppp/",
          },
        }
      : { ...request, publiclyAvailable: false, publicSource: undefined },
  );
}

// POST /cases/:id/draft
export async function generateDraft(
  requests: InformationRequest[],
  caseId?: string,
): Promise<DraftResult> {
  if (API_URL && caseId) {
    return postJson<DraftResult>(`/cases/${caseId}/draft`, { requests });
  }

  const draftText = requests
    .map(
      (request) => `Subject: Request for information regarding "${request.title}"
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
