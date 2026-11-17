import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { DraftResult, FollowUpContext, InformationRequest } from "../../types";
import RtiDraftingWizard from "./index";
import { generateDraft, runPreflight } from "./mocks";

vi.mock("./mocks", async (original) => ({
  ...(await original<typeof import("./mocks")>()),
  generateDraft: vi.fn(),
  runPreflight: vi.fn(),
}));

const draftMock = vi.mocked(generateDraft);
const preflightMock = vi.mocked(runPreflight);
const { runPreflight: realPreflight } = await vi.importActual<typeof import("./mocks")>("./mocks");

const WORK_ORDER: InformationRequest = {
  id: "FU-RQ-001",
  category: "Work order",
  title: "Copy of the work order for the road repair",
  authority: "PWD",
  period: "Last 1 year",
  quality: "good",
};

// A follow-up starts at the Requests step, so these tests need no grievance or clarification.
const FOLLOW_UP: FollowUpContext = { originalAuthority: "PWD", requests: [WORK_ORDER] };

const VAGUE: InformationRequest = {
  ...WORK_ORDER,
  id: "FU-RQ-002",
  category: "Expenditure",
  title: "Details of amount spent",
  quality: "needs-detail",
};

const DRAFT: DraftResult = {
  draftText: "Under Section 6(1)...\n1. Copy of the work order for the road repair",
  charCount: 60,
  overLimit: false,
  flaggedRequestIds: [],
};

beforeEach(() => {
  draftMock.mockReset();
  preflightMock.mockReset();
  // The built-in rules, as in the demo without a backend.
  preflightMock.mockImplementation(realPreflight);
});

function continueButton() {
  return screen.getByRole("button", { name: /^continue$/i }) as HTMLButtonElement;
}

// Requests -> officer check.
async function toOfficerCheck() {
  fireEvent.click(continueButton());
  await screen.findByText(/reluctant Public Information Officer/);
}

// Requests -> officer check -> draft.
async function toDraft() {
  await toOfficerCheck();
  fireEvent.click(continueButton());
  await screen.findByText(/Under Section 6\(1\)/);
}

test("a failed draft shows an error and gives the buttons back", async () => {
  draftMock.mockRejectedValue(new Error("POST /draft failed with status 500"));
  render(<RtiDraftingWizard followUp={FOLLOW_UP} />);
  await toOfficerCheck();

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

test("requests pass the officer check on the way to the draft, with no public-info step", async () => {
  draftMock.mockResolvedValue(DRAFT);
  render(<RtiDraftingWizard followUp={FOLLOW_UP} />);
  expect(screen.queryByText("Public info")).toBeNull();
  expect(screen.getByText("Step 3 of 5 · Requests")).toBeTruthy();

  await toOfficerCheck();
  expect(screen.getByText("Step 4 of 5 · Officer check")).toBeTruthy();
  expect(preflightMock).toHaveBeenCalledWith([WORK_ORDER], undefined);
  expect(screen.getByText(/No easy excuses found/)).toBeTruthy();
  expect(screen.getByText("No easy excuse")).toBeTruthy();
  expect(screen.getByText(/Checked with fixed rules from the RTI Act\./)).toBeTruthy();

  fireEvent.click(continueButton());
  await screen.findByText(/Under Section 6\(1\)/);
  expect(draftMock).toHaveBeenCalledWith([WORK_ORDER], undefined, "en");
  expect(screen.getByText(/The PIO must reply by/)).toBeTruthy();

  // Back from the draft goes to the check, not past it.
  fireEvent.click(screen.getByRole("button", { name: /back/i }));
  expect(screen.getByText("Step 4 of 5 · Officer check")).toBeTruthy();
});

test("switching to Hindi asks for the draft again in Hindi", async () => {
  draftMock.mockResolvedValue(DRAFT);
  render(<RtiDraftingWizard followUp={FOLLOW_UP} />);
  await toDraft();

  draftMock.mockResolvedValue({ ...DRAFT, draftText: "धारा 6(1) के अंतर्गत..." });
  fireEvent.click(screen.getByRole("button", { name: "हिंदी" }));

  await screen.findByText(/धारा 6\(1\)/);
  expect(draftMock).toHaveBeenLastCalledWith(FOLLOW_UP.requests, undefined, "hi");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "हिंदी" }).getAttribute("aria-pressed")).toBe("true"),
  );
});

test("a vague request shows the officer's excuse, and fixing the wording clears it", async () => {
  draftMock.mockResolvedValue(DRAFT);
  render(<RtiDraftingWizard followUp={{ originalAuthority: "PWD", requests: [WORK_ORDER, VAGUE] }} />);
  await toOfficerCheck();

  expect(screen.getByText("The officer could use an excuse on 1 of 2 requests.")).toBeTruthy();
  expect(screen.getByText(/does not make clear which records are sought/)).toBeTruthy();
  expect(screen.getByText("(Section 6(1))")).toBeTruthy();

  const better = "Copies of the bills paid for the repair of this road";
  fireEvent.change(screen.getByLabelText("Wording of request 2"), { target: { value: better } });
  expect(screen.getByText(/You changed the wording/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /check again/i }));
  await screen.findByText(/No easy excuses found/);
  expect(screen.queryByText(/You changed the wording/)).toBeNull();

  fireEvent.click(continueButton());
  await screen.findByText(/Under Section 6\(1\)/);
  const drafted = draftMock.mock.calls[0][0];
  expect(drafted[1]).toMatchObject({ title: better, quality: "good" });
});

test("the AI's suggested wording can be used in one click", async () => {
  draftMock.mockResolvedValue(DRAFT);
  const suggestion = "Copies of the bills and measurement book entries for the repair of this road";
  preflightMock.mockImplementation(async (requests) => {
    const result = await realPreflight(requests, undefined);
    return {
      aiUsed: true,
      items: result.items.map((item) =>
        item.requestId === VAGUE.id ? { ...item, suggestedTitle: suggestion } : item,
      ),
    };
  });
  render(<RtiDraftingWizard followUp={{ originalAuthority: "PWD", requests: [VAGUE] }} />);
  await toOfficerCheck();

  expect(screen.getByText(/and by AI/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /use this wording/i }));

  expect((screen.getByLabelText("Wording of request 1") as HTMLTextAreaElement).value).toBe(suggestion);
  expect(screen.getByText("Using the suggested wording")).toBeTruthy();

  fireEvent.click(continueButton());
  await screen.findByText(/Under Section 6\(1\)/);
  expect(draftMock.mock.calls[0][0][0].title).toBe(suggestion);
});

test("a failed check can be retried, and never blocks the draft", async () => {
  draftMock.mockResolvedValue(DRAFT);
  preflightMock.mockRejectedValueOnce(new Error("POST /preflight failed with status 500"));
  render(<RtiDraftingWizard followUp={FOLLOW_UP} />);

  fireEvent.click(continueButton());
  expect(await screen.findByText(/couldn't run the officer check/)).toBeTruthy();
  expect(continueButton().disabled).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  await screen.findByText(/No easy excuses found/);
  expect(screen.queryByText(/couldn't run the officer check/)).toBeNull();

  preflightMock.mockRejectedValueOnce(new Error("down again"));
  fireEvent.click(screen.getByRole("button", { name: /back/i }));
  fireEvent.click(continueButton());
  await screen.findByText(/couldn't run the officer check/);
  fireEvent.click(continueButton());
  await screen.findByText(/Under Section 6\(1\)/);
});

test("an emptied request cannot be drafted", async () => {
  render(<RtiDraftingWizard followUp={{ originalAuthority: "PWD", requests: [VAGUE] }} />);
  await toOfficerCheck();

  fireEvent.change(screen.getByLabelText("Wording of request 1"), { target: { value: "   " } });
  fireEvent.click(continueButton());

  expect(screen.getByText(/Every request needs some wording/)).toBeTruthy();
  expect(draftMock).not.toHaveBeenCalled();
});

test("inspection and samples are added as Section 2(j) requests and reach the draft", async () => {
  draftMock.mockResolvedValue(DRAFT);
  render(<RtiDraftingWizard followUp={FOLLOW_UP} />);
  // A follow-up's own description is not about quality, so the offer is not marked suggested.
  expect(screen.queryByText("Suggested for your complaint")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /ask to inspect the work/i }));
  fireEvent.click(screen.getByRole("button", { name: /ask for certified samples/i }));

  expect(screen.getByText("Inspection added")).toBeTruthy();
  expect(screen.getByText("Samples added")).toBeTruthy();
  expect(screen.getAllByText("Section 2(j)")).toHaveLength(2);
  expect(screen.getByText(/under Section 2\(j\)\(i\) of the RTI Act/)).toBeTruthy();

  // Removing one brings its button back.
  fireEvent.click(screen.getByRole("button", { name: /Remove "Certified samples/ }));
  expect(screen.getByRole("button", { name: /ask for certified samples/i })).toBeTruthy();

  await toOfficerCheck();
  expect(screen.getAllByText("No easy excuse")).toHaveLength(2);

  fireEvent.click(continueButton());
  await screen.findByText(/Under Section 6\(1\)/);
  const drafted = draftMock.mock.calls[0][0];
  expect(drafted.map((r) => r.id)).toEqual(["FU-RQ-001", "RQ-INSPECT"]);
  expect(drafted[1]).toMatchObject({ source: "inspection", authority: "PWD", period: "Last 1 year" });
});

test("the 'what happens next' guide explains fees and lab tests", () => {
  render(<RtiDraftingWizard followUp={FOLLOW_UP} />);
  const offer = screen.getByRole("region", { name: /go beyond papers/i });

  fireEvent.click(within(offer).getByText("What happens next?"));

  expect(within(offer).getByText(/any fee with its calculation \(Section 7\(3\)\)/)).toBeTruthy();
  expect(within(offer).getByText(/accredited \(NABL\) laboratory/)).toBeTruthy();
});
