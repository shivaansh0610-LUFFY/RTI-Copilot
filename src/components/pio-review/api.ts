import type { DraftReview } from "../../types";

const API_URL: string | undefined = import.meta.env.VITE_API_URL;

export const REVIEW_LIMIT = 12000; // backend/app/schemas/review.py

export class ReviewUnavailable extends Error {}

// POST /review-draft. The checks run on the server, so the browser-only demo (no VITE_API_URL)
// cannot run them.
export async function reviewDraft(draftText: string): Promise<DraftReview> {
  if (!API_URL) throw new ReviewUnavailable("The PIO review needs the RTI Copilot server.");
  const response = await fetch(`${API_URL}/review-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftText }),
  });
  if (!response.ok) throw new Error(`POST /review-draft failed with status ${response.status}`);
  return response.json();
}
