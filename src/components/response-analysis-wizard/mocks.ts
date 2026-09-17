import type {
  ClassificationResult,
  InformationRequest,
  ResponsePassage,
} from "../../types";

// Mock backend calls — each is a single async function so it's a one-line
// swap for a real API call later. Replace the body, keep the signature.

const MOCK_PASSAGES: ResponsePassage[] = [
  {
    id: "P-1",
    page: 1,
    paragraph: 1,
    text: "Work Order No. WO/2023/458 dated 12-Jan-2023 was issued for resurfacing of the road at 5th Cross.",
  },
  {
    id: "P-2",
    page: 1,
    paragraph: 3,
    text: "The resurfacing project referenced above has been completed and closed as of March 2023.",
  },
  {
    id: "P-3",
    page: 2,
    paragraph: 1,
    text: "Routine maintenance inspections for all ward roads are scheduled quarterly as per the standard operating procedure.",
  },
  {
    id: "P-4",
    page: 2,
    paragraph: 2,
    text: "Please refer to Annexure B (contractor agreement) enclosed with this response for further details.",
  },
  {
    id: "P-5",
    page: 3,
    paragraph: 1,
    text: "[scan quality insufficient — passage largely illegible]",
  },
  {
    id: "P-6",
    page: 3,
    paragraph: 2,
    text: "An additional processing fee of Rs. 500 is payable before the requested photocopies can be issued.",
  },
];

// Replace with: POST /cases/:id/response (multipart upload)
export async function ingestResponse(
  _file: File,
): Promise<{ pages: number; passages: ResponsePassage[]; ocrUsed: boolean }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ pages: 3, passages: MOCK_PASSAGES, ocrUsed: true });
    }, 1500);
  });
}

// Replace with: POST /cases/:id/align
export async function alignRequests(
  requests: InformationRequest[],
  passages: ResponsePassage[],
): Promise<Record<string, ResponsePassage[]>> {
  const byId = (id: string) => passages.find((p) => p.id === id);
  const alignment: Record<string, ResponsePassage[]> = {};
  const mapping: Record<string, string[]> = {
    "RQ-001": ["P-1"],
    "RQ-002": ["P-2"],
    "RQ-003": [],
    "RQ-004": ["P-4"],
    "RQ-005": ["P-6"],
    "RQ-006": ["P-5"],
  };
  for (const request of requests) {
    const passageIds = mapping[request.id] ?? [];
    alignment[request.id] = passageIds
      .map(byId)
      .filter((p): p is ResponsePassage => Boolean(p));
  }
  return alignment;
}

// Replace with: POST /cases/:id/classify
export async function classifyResponse(
  request: InformationRequest,
  matched: ResponsePassage[],
): Promise<ClassificationResult> {
  switch (request.id) {
    case "RQ-001":
      return {
        requestId: request.id,
        label: "RESPONSIVE",
        explanation: "The response directly provides the work order copy that was requested.",
        evidence: matched,
      };
    case "RQ-002":
      return {
        requestId: request.id,
        label: "PARTIALLY_RESPONSIVE",
        explanation:
          "The response confirms the project was completed but does not include the expenditure breakdown that was requested.",
        evidence: matched,
      };
    case "RQ-004":
      return {
        requestId: request.id,
        label: "ATTACHMENT_REFERENCED",
        explanation:
          "The response refers to an enclosed attachment (Annexure B) rather than answering inline.",
        evidence: matched,
      };
    case "RQ-005":
      return {
        requestId: request.id,
        label: "FEE_DEMANDED",
        explanation:
          "The authority has asked for an additional fee before releasing the requested copies.",
        evidence: matched,
      };
    case "RQ-006":
      return {
        requestId: request.id,
        label: "INSUFFICIENT_EVIDENCE",
        explanation: "The matched passage is too degraded to determine whether it addresses this request.",
        evidence: matched,
        abstentionReason: "OCR quality on this passage is too poor to confirm relevance.",
      };
    default:
      return {
        requestId: request.id,
        label: "NO_RECORD_STATED",
        explanation:
          "No passage in the response addresses this request; the authority appears not to have stated a record for it.",
        evidence: matched,
      };
  }
}
