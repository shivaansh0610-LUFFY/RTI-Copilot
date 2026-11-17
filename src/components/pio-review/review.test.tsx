import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { DraftReview } from "../../types";
import { reviewDraft, ReviewUnavailable } from "./api";
import PioReview from "./PioReview";
import ReviewPage from "./ReviewPage";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  reviewDraft: vi.fn(),
}));
const reviewMock = vi.mocked(reviewDraft);

const DRAFT = "To the PIO\n1. Why was the road not repaired?\nName: [Your name]";
const IMPROVED =
  "I hereby request information under Section 6(1) of the Right to Information Act, 2005.\n1. Copy of the inspection report for the road.";

const REVIEW: DraftReview = {
  score: 6,
  outOf: 10,
  verdict: "fix",
  aiUsed: true,
  checks: [
    {
      id: "ASKS_FOR_RECORDS",
      label: "Asks for records, not explanations or complaints",
      passed: false,
      section: "Section 2(f)",
      why: "The Act gives access to records the office holds.",
      fix: "Ask for the record that would show the answer.",
      notes: [{ point: 1, officerSays: "The RTI Act gives access to records, not answers to 'why' questions." }],
    },
    {
      id: "PERIOD",
      label: "Gives a time period",
      passed: false,
      section: "Section 6(1)",
      why: "Without a period the PIO can say the records are too many.",
      fix: "Add the period you mean.",
      notes: [],
    },
    { id: "PORTAL_LIMIT", label: "Fits the online portal (3,000 characters)", passed: true, notes: [] },
  ],
  improved: { text: IMPROVED, score: 9, fixed: ["ASKS_FOR_RECORDS"] },
};

beforeEach(() => {
  reviewMock.mockReset();
});

test("the review shows the score, what the officer could say, and the fix", async () => {
  reviewMock.mockResolvedValue(REVIEW);
  render(<PioReview text={DRAFT} />);

  fireEvent.click(screen.getByRole("button", { name: /check like a pio/i }));

  expect(await screen.findByLabelText("Score 6 out of 10")).toBeTruthy();
  expect(reviewMock).toHaveBeenCalledWith(DRAFT);
  expect(screen.getByText("Fix a few things before you file.")).toBeTruthy();
  expect(screen.getByText(/not a chance of getting a reply/)).toBeTruthy();
  const problems = screen.getByRole("list", { name: "Problems found" });
  expect(within(problems).getByText(/Point 1, the officer could reply/)).toBeTruthy();
  expect(within(problems).getByText("(Section 2(f))")).toBeTruthy();
  expect(screen.getByText("1 check passed")).toBeTruthy();
});

test("what the AI officer noticed is listed apart from the score", async () => {
  reviewMock.mockResolvedValue({
    ...REVIEW,
    aiNotes: [
      { point: 1, checkId: "SPECIFIC", officerSays: "The request does not make clear which records are sought." },
      // Two problems of the same kind on one point (too vague, and no place): both are listed.
      { point: 1, checkId: "SPECIFIC", officerSays: "The road or place this request is about cannot be identified." },
    ],
  });
  render(<PioReview text={DRAFT} />);
  fireEvent.click(screen.getByRole("button", { name: /check like a pio/i }));

  expect(await screen.findByText(/The AI officer also noticed \(not part of the score\)/)).toBeTruthy();
  expect(screen.getByText(/Point 1: .The request does not make clear/)).toBeTruthy();
  expect(screen.getByText(/Point 1: .The road or place/)).toBeTruthy();
  expect(screen.getByLabelText("Score 6 out of 10")).toBeTruthy();
});

test("the improved version shows its changes, what is still to do, and can be used", async () => {
  reviewMock.mockResolvedValue(REVIEW);
  const onUse = vi.fn();
  render(<PioReview text={DRAFT} onUse={onUse} />);
  fireEvent.click(screen.getByRole("button", { name: /check like a pio/i }));

  expect(await screen.findByText("Improved version: 9/10")).toBeTruthy();
  // The citizen must add the period themselves: it is never invented.
  expect(screen.getByText(/Still for you to fix.*gives a time period/)).toBeTruthy();
  const shown = screen.getByTestId("improved-text");
  const added = [...shown.querySelectorAll("ins")].map((node) => node.textContent).join(" ");
  const removed = [...shown.querySelectorAll("del")].map((node) => node.textContent).join(" ");
  expect(added).toContain("Section 6(1)");
  expect(added).toContain("1. Copy of the inspection report for the road.");
  expect(removed).toContain("1. Why was the road not repaired?");

  fireEvent.click(screen.getByRole("button", { name: "Clean text" }));
  expect(screen.getByTestId("improved-text").textContent).toBe(IMPROVED);

  fireEvent.click(screen.getByRole("button", { name: /use this version/i }));
  expect(onUse).toHaveBeenCalledWith(IMPROVED);
});

test("a review belongs to its text: change the text and it asks to check again", async () => {
  reviewMock.mockResolvedValue(REVIEW);
  const { rerender } = render(<PioReview text={DRAFT} />);
  fireEvent.click(screen.getByRole("button", { name: /check like a pio/i }));
  await screen.findByLabelText("Score 6 out of 10");

  rerender(<PioReview text={DRAFT + " more"} />);

  expect(screen.queryByLabelText("Score 6 out of 10")).toBeNull();
  expect(screen.getByText(/The text changed since the last review/)).toBeTruthy();
});

test("a review run with the rules only says so", async () => {
  reviewMock.mockResolvedValue({ ...REVIEW, aiUsed: false, improved: undefined });
  render(<PioReview text={DRAFT} />);
  fireEvent.click(screen.getByRole("button", { name: /check like a pio/i }));

  expect(await screen.findByText(/The AI wasn't available this time/)).toBeTruthy();
  expect(screen.queryByText(/Improved version/)).toBeNull();
});

test("errors are explained, and the button comes back", async () => {
  reviewMock.mockRejectedValueOnce(new ReviewUnavailable("no server"));
  render(<PioReview text={DRAFT} />);
  fireEvent.click(screen.getByRole("button", { name: /check like a pio/i }));
  expect(await screen.findByText(/needs the RTI Copilot server/)).toBeTruthy();

  reviewMock.mockRejectedValueOnce(new Error("500"));
  fireEvent.click(screen.getByRole("button", { name: /check like a pio/i }));
  expect(await screen.findByText(/couldn't run the PIO review/)).toBeTruthy();
  expect((screen.getByRole("button", { name: /check like a pio/i }) as HTMLButtonElement).disabled).toBe(false);
});

test("on the paste page, the improved version replaces the pasted text", async () => {
  reviewMock.mockResolvedValue(REVIEW);
  render(<ReviewPage />);
  const box = screen.getByLabelText("Your application") as HTMLTextAreaElement;
  expect((screen.getByRole("button", { name: /check like a pio/i }) as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(box, { target: { value: DRAFT } });
  fireEvent.click(screen.getByRole("button", { name: /check like a pio/i }));
  fireEvent.click(await screen.findByRole("button", { name: /use this version/i }));

  expect(box.value).toBe(IMPROVED);
  expect(screen.getByText(/Using the improved version/)).toBeTruthy();
});
