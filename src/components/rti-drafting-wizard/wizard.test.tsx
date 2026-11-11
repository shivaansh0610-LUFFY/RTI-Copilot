import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { DraftResult, FollowUpContext } from "../../types";
import RtiDraftingWizard from "./index";
import { generateDraft } from "./mocks";

vi.mock("./mocks", async (original) => ({
  ...(await original<typeof import("./mocks")>()),
  generateDraft: vi.fn(),
}));

const draftMock = vi.mocked(generateDraft);

// A follow-up starts at the Requests step, so these tests need no grievance or clarification.
const FOLLOW_UP: FollowUpContext = {
  originalAuthority: "PWD",
  requests: [
    {
      id: "FU-RQ-001",
      category: "Work order",
      title: "Copy of the work order for the road repair",
      authority: "PWD",
      period: "Last 1 year",
      quality: "good",
    },
  ],
};

const DRAFT: DraftResult = {
  draftText: "Under Section 6(1)...\n1. Copy of the work order for the road repair",
  charCount: 60,
  overLimit: false,
  flaggedRequestIds: [],
};

beforeEach(() => draftMock.mockReset());

function continueButton() {
  return screen.getByRole("button", { name: /continue/i }) as HTMLButtonElement;
}

test("a failed draft shows an error and gives the buttons back", async () => {
  draftMock.mockRejectedValue(new Error("POST /draft failed with status 500"));
  render(<RtiDraftingWizard followUp={FOLLOW_UP} />);

  fireEvent.click(continueButton());

  expect(await screen.findByText(/couldn't create the draft/i)).toBeTruthy();
  expect(continueButton().disabled).toBe(false);
  expect((screen.getByRole("button", { name: /back/i }) as HTMLButtonElement).disabled).toBe(false);

  // Trying again works.
  draftMock.mockResolvedValue(DRAFT);
  fireEvent.click(continueButton());
  expect(await screen.findByText(/Under Section 6\(1\)/)).toBeTruthy();
  expect(screen.queryByText(/couldn't create the draft/i)).toBeNull();
});

test("requests go straight to the draft, with no public-info step", async () => {
  draftMock.mockResolvedValue(DRAFT);
  render(<RtiDraftingWizard followUp={FOLLOW_UP} />);

  expect(screen.queryByText("Public info")).toBeNull();
  fireEvent.click(continueButton());

  await screen.findByText(/Under Section 6\(1\)/);
  expect(draftMock).toHaveBeenCalledWith(FOLLOW_UP.requests, undefined, "en");
  expect(screen.getByText(/The PIO must reply by/)).toBeTruthy();
});

test("switching to Hindi asks for the draft again in Hindi", async () => {
  draftMock.mockResolvedValue(DRAFT);
  render(<RtiDraftingWizard followUp={FOLLOW_UP} />);
  fireEvent.click(continueButton());
  await screen.findByText(/Under Section 6\(1\)/);

  draftMock.mockResolvedValue({ ...DRAFT, draftText: "धारा 6(1) के अंतर्गत..." });
  fireEvent.click(screen.getByRole("button", { name: "हिंदी" }));

  await screen.findByText(/धारा 6\(1\)/);
  expect(draftMock).toHaveBeenLastCalledWith(FOLLOW_UP.requests, undefined, "hi");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "हिंदी" }).getAttribute("aria-pressed")).toBe("true"),
  );
});
