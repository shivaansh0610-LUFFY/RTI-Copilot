import type { InformationRequest } from "../../types";

// RTI is more than photocopies. Section 2(j) of the Act includes the right to "(i) inspection of
// work, documents, records" and "(iii) taking certified samples of material". These are the two
// requests the Requests step offers, worded by the app (source "inspection", so the officer
// check leaves them alone).

export type InspectionKind = "inspect" | "samples";

export const INSPECTION_IDS: Record<InspectionKind, string> = {
  inspect: "RQ-INSPECT",
  samples: "RQ-SAMPLES",
};

const WORDING: Record<InspectionKind, { category: string; title: string }> = {
  inspect: {
    category: "Inspection of work",
    title:
      "Inspection of the road work at the location given in this application, and of its records (the estimate, measurement book and quality test reports), under Section 2(j)(i) of the RTI Act. Please tell me a date and time for the inspection.",
  },
  samples: {
    category: "Certified samples",
    title:
      "Certified samples of the materials used in the most recent repair or resurfacing of the road at the location given in this application, under Section 2(j)(iii) of the RTI Act. Please tell me in advance when the samples will be taken, so that I can be present.",
  },
};

export function inspectionRequest(kind: InspectionKind, authority: string, period: string): InformationRequest {
  return {
    id: INSPECTION_IDS[kind],
    ...WORDING[kind],
    authority,
    period,
    quality: "good",
    source: "inspection",
  };
}

// Complaints where seeing the work and testing its material matter most: a repair that did not
// last, or poor quality. The offer is always there; these make it "suggested".
const QUALITY_COMPLAINT =
  /\b(again|already|poor|bad|low|sub-?standard|quality|cracks?|cracked|crumbl\w*|washed\s+away|sinking|sunk|caved|resurfac\w*|re-?laid|patch\s?work|patched)\b/i;

export function suggestsInspection(grievance: string): boolean {
  return QUALITY_COMPLAINT.test(grievance);
}
