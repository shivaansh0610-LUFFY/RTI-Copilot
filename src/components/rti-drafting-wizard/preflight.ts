import type { InformationRequest, PreflightCode, PreflightIssue, PreflightResult } from "../../types";

// The officer check's fixed rules, for the browser-only demo (no backend). A copy of
// app/services/preflight.py: change both together. preflight-cases.json holds the cases both
// must agree on, and each side's tests check them.

type Excuse = Omit<PreflightIssue, "code">;

// In the order they are shown.
export const EXCUSES: Record<PreflightCode, Excuse> = {
  QUESTION_NOT_RECORD: {
    officerSays:
      "The RTI Act gives access to records, not answers to 'why' questions. No information can be provided.",
    why: "Information under the Act means material the office already holds. Officers often refuse 'why' and 'explain' questions on this ground.",
    section: "Section 2(f)",
    fix: "Ask for the records that would show the answer: the file notings, letters, orders or inspection notes about it.",
  },
  CREATES_NEW_INFO: {
    officerSays: "This asks for an opinion or about future plans. No such record exists.",
    why: "An officer only has to give records that already exist. They do not have to give opinions or say what will happen next.",
    section: "Section 2(f)",
    fix: "Ask for what exists today: the sanction, estimate or approved schedule for the work, or the letters about it.",
  },
  TOO_VAGUE: {
    officerSays: "The request does not make clear which records are sought.",
    why: "You must specify the information you want. A vague request gets a general reply, or a letter asking you to clarify, which costs weeks.",
    section: "Section 6(1)",
    fix: "Name the record (for example a copy of the bill, the measurement book entry or the completion certificate) and the road it is about.",
  },
  TOO_BROAD: {
    officerSays: "Collecting this would disproportionately divert the resources of the office.",
    why: "The Act only lets an officer give information in another form for this reason, but it is often used to delay or refuse very wide requests.",
    section: "Section 7(9)",
    fix: "Limit it to this road or stretch, and name the exact records you want.",
  },
  PERSONAL_INFO: {
    officerSays: "This is personal information with no relation to any public activity. Exempt.",
    why: "Personal details of officials or contractors (home address, phone, tax returns, bank details) can be refused unless a larger public interest is shown.",
    section: "Section 8(1)(j)",
    fix: "Ask for the official record instead: the contractor firm named in the work order, or the official's name and designation.",
  },
  NO_PLACE: {
    officerSays: "The road or place this request is about cannot be identified.",
    why: "Without a street, landmark or location, the officer can reply that the records cannot be traced.",
    section: "Section 6(1)",
    fix: "Name the road or a nearby landmark, or pin the location on the map.",
  },
};

const ORDER = Object.keys(EXCUSES) as PreflightCode[];

// Matches app/services/drafting/specificity.py and the "needs detail" badge.
export const MIN_WORDS = 6;

export function isVague(title: string): boolean {
  return title.trim().split(/\s+/).filter(Boolean).length < MIN_WORDS;
}

// A request for copies of records is a records request even when it mentions why something
// happened ("Copies of the file notings explaining why the work stopped").
const ASKS_FOR_COPIES = /^\s*(certified\s+)?cop(y|ies)\s+of\b/i;
const WHY = /\bwhy\b|\bhow\s+come\b|\bexplain\b|\bjustif(y|ication)\b/i;
const FUTURE_OR_OPINION =
  /\bwhen\s+will\b|\bby\s+when\b|\bwhat\s+(action|steps)\s+will\b|\bwill\s+(the|you|pwd|it|they)\b|\bopinion\b|\bwhether\b.*\b(is|was|are|were)\s+(correct|right|justified|proper|legal)\b/i;
const TOO_BROAD =
  /\b(all|every|entire)\s+(the\s+)?(records|files|documents|information|roads|works|tenders|contracts|complaints)\b|\b(across|all\s+over|whole\s+of)\s+delhi\b/i;
const PERSONAL =
  /\b(home|residential)\s+address\b|\b(personal|mobile|phone)\s+numbers?\b|\bpersonal\s+(details|information|life)\b|\bincome\s+tax\s+returns?\b|\bmedical\s+records?\b|\bbank\s+(account|details|statements?)\b|\bannual\s+confidential\s+reports?\b|\bACRs?\b/i;

export function ruleIssues(request: Pick<InformationRequest, "title" | "quality" | "source">): PreflightCode[] {
  if (request.source === "inspection") return []; // our own Section 2(j) wording
  const { title } = request;
  const asksForCopies = ASKS_FOR_COPIES.test(title);
  const found = new Set<PreflightCode>();
  if (WHY.test(title) && !asksForCopies) found.add("QUESTION_NOT_RECORD");
  if (FUTURE_OR_OPINION.test(title) && !asksForCopies) found.add("CREATES_NEW_INFO");
  if (request.quality === "needs-detail" || isVague(title)) found.add("TOO_VAGUE");
  if (TOO_BROAD.test(title)) found.add("TOO_BROAD");
  if (PERSONAL.test(title)) found.add("PERSONAL_INFO");
  return ORDER.filter((code) => found.has(code));
}

// The whole check without a backend: the rules only, so no suggested wording.
export function checkLocally(requests: InformationRequest[]): PreflightResult {
  return {
    aiUsed: false,
    items: requests.map((request) => ({
      requestId: request.id,
      issues: ruleIssues(request).map((code) => ({ code, ...EXCUSES[code] })),
    })),
  };
}

// The quality a title earns once the citizen has edited it.
export function qualityOf(title: string): InformationRequest["quality"] {
  return isVague(title) ? "needs-detail" : "good";
}
