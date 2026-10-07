import type { InformationRequest } from "../../types";

// Mock backend calls — each is a single async function so it's a one-line
// swap for a real API call later. Replace the body, keep the signature.

const DEFAULT_AUTHORITY = "Public Works Department (PWD), Ward Division Office";

// Replace with: POST /cases/:id/decompose
export async function decomposeGrievance(
  _grievance: string,
  clarification: Record<string, string>,
): Promise<InformationRequest[]> {
  const period = clarification.period ?? "Last 1 year";
  return [
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

// Replace with: POST /cases/:id/public-info-check
export async function checkPublicInfo(
  requests: InformationRequest[],
): Promise<InformationRequest[]> {
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

// Replace with: POST /cases/:id/draft
export async function generateDraft(requests: InformationRequest[]): Promise<string> {
  return requests
    .map(
      (request) => `Subject: Request for information regarding "${request.title}"
Authority: ${request.authority}
Particulars of information sought: ${request.title}
Period: ${request.period}
${request.context ? `Background: ${request.context}\n` : ""}`,
    )
    .join("\n---\n\n");
}
