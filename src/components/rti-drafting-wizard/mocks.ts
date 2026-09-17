import type { InformationRequest } from "../../types";

// Mock backend calls — each is a single async function so it's a one-line
// swap for a real API call later. Replace the body, keep the signature.

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
      authority: "Public Works Department (PWD), Ward Division Office",
      period,
      quality: "good",
    },
    {
      id: "RQ-002",
      category: "Expenditure",
      title: "Details of amount spent",
      authority: "Public Works Department (PWD), Ward Division Office",
      period,
      quality: "needs-detail",
    },
    {
      id: "RQ-003",
      category: "Inspection report",
      title: "Copy of the most recent inspection/quality-check report for the road",
      authority: "Public Works Department (PWD), Ward Division Office",
      period,
      quality: "good",
    },
  ];
}

// Replace with: POST /cases/:id/public-info-check
export async function checkPublicInfo(
  requests: InformationRequest[],
): Promise<InformationRequest[]> {
  return requests.map((request) =>
    request.id === "RQ-001"
      ? { ...request, publiclyAvailable: true }
      : { ...request, publiclyAvailable: false },
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
`,
    )
    .join("\n---\n\n");
}
