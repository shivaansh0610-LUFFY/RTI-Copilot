import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { FiledCase, ResponseAnalysis } from "../../types";
import ResponseAnalysisWizard from "./index";
import { analyseResponse, draftAppeal } from "./mocks";

vi.mock("./mocks", async (original) => ({
  ...(await original<typeof import("./mocks")>()),
  // Tests run without a backend URL; pretend there is one.
  canAnalyseForReal: (caseId: string | undefined) => Boolean(caseId),
  analyseResponse: vi.fn(),
  draftAppeal: vi.fn(),
}));

const FILED: FiledCase = {
  caseId: "case-1",
  requests: [
    {
      id: "RQ-001",
      category: "Work order",
      title: "Copy of the work order for Ring Road",
      authority: "PWD",
      period: "Last 6 months",
      quality: "good",
    },
    {
      id: "RQ-002",
      category: "Measurement Book",
      title: "Copies of the Measurement Book entries for Ring Road",
      authority: "PWD",
      period: "Last 6 months",
      quality: "good",
    },
  ],
};

const FEE_PASSAGE = { id: "P-4", page: 1, paragraph: 4, text: "3. Deposit Rs. 46 for the MB copies." };
const ANALYSIS: ResponseAnalysis = {
  pages: 1,
  ocrUsed: false,
  passages: [FEE_PASSAGE],
  results: [
    {
      requestId: "RQ-001",
      label: "NON_RESPONSIVE",
      explanation: "The reply does not mention the work order.",
      evidence: [],
    },
    { requestId: "RQ-002", label: "FEE_DEMANDED", explanation: "Rs. 46 is asked.", evidence: [FEE_PASSAGE] },
  ],
};

beforeEach(() => {
  vi.mocked(analyseResponse).mockReset();
  vi.mocked(draftAppeal).mockReset();
});

function upload() {
  const input = document.getElementById("response-file") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["%PDF-"], "reply.pdf")] } });
  fireEvent.click(screen.getByRole("button", { name: /process response/i }));
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

test("analyses the real reply against the drafted case's own requests", async () => {
  vi.mocked(analyseResponse).mockResolvedValue(ANALYSIS);
  vi.mocked(draftAppeal).mockResolvedValue("To, The First Appellate Authority ... [registration number]");
  render(<ResponseAnalysisWizard filedCase={FILED} onFileFollowUp={() => {}} />);

  expect(screen.queryByText(/Sample data/)).toBeNull();
  upload();
  await screen.findByText(/Response processed/);
  expect(vi.mocked(analyseResponse).mock.calls[0][0]).toBe("case-1");

  next(); // align: the passage each finding cites
  expect(screen.getByText(/Deposit Rs. 46/)).toBeTruthy();
  next(); // classify
  expect(screen.getByText("The reply does not mention the work order.")).toBeTruthy();
  next(); // summary

  fireEvent.click(screen.getByRole("button", { name: /draft first appeal \(1\)/i }));
  await screen.findByText(/First Appellate Authority \.\.\./);
  expect(vi.mocked(draftAppeal)).toHaveBeenCalledWith("case-1", [
    {
      requestId: "RQ-001",
      title: "Copy of the work order for Ring Road",
      label: "NON_RESPONSIVE",
      explanation: "The reply does not mention the work order.",
    },
  ]);
});

test("shows the server's reason when the reply cannot be read", async () => {
  vi.mocked(analyseResponse).mockRejectedValue(new Error("No text was found in this file. It may be a scanned paper reply."));
  render(<ResponseAnalysisWizard filedCase={FILED} onFileFollowUp={() => {}} />);

  upload();

  expect(await screen.findByText(/may be a scanned paper reply/)).toBeTruthy();
  expect((screen.getByRole("button", { name: /retry/i }) as HTMLButtonElement).disabled).toBe(false);
});

test("without a drafted case it says it is showing sample data", () => {
  render(<ResponseAnalysisWizard onFileFollowUp={() => {}} />);

  expect(screen.getByText(/Sample data/)).toBeTruthy();
  expect(screen.queryByText(/simulate/i)).toBeNull();
});
