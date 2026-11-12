import { expect, test } from "vitest";
import type { InformationRequest, PreflightCode } from "../../types";
import { checkLocally, EXCUSES, qualityOf, ruleIssues } from "./preflight";
import cases from "./preflight-cases.json";

// backend/tests/test_preflight.py checks the server's rules against the same cases.
type Case = { title: string; quality?: InformationRequest["quality"]; source?: InformationRequest["source"]; codes: string[] };

test.each(cases as Case[])("rules: $title", ({ title, quality = "good", source = "generated", codes }) => {
  expect(ruleIssues({ title, quality, source })).toEqual(codes);
});

test("every code in the shared cases has its officer text", () => {
  for (const { codes } of cases as Case[]) {
    for (const code of codes) expect(EXCUSES[code as PreflightCode]).toBeDefined();
  }
});

test("the local check returns one item per request, with the full excuse", () => {
  const base = { category: "x", authority: "PWD", period: "Last 1 year", quality: "good" as const };
  const result = checkLocally([
    { ...base, id: "RQ-001", title: "Copy of the work order for the road repair at the market" },
    { ...base, id: "RQ-002", title: "Why is the road still broken after the repair?" },
  ]);

  expect(result.aiUsed).toBe(false);
  expect(result.items[0]).toEqual({ requestId: "RQ-001", issues: [] });
  expect(result.items[1].requestId).toBe("RQ-002");
  expect(result.items[1].issues).toEqual([{ code: "QUESTION_NOT_RECORD", ...EXCUSES.QUESTION_NOT_RECORD }]);
  expect(result.items[1]).not.toHaveProperty("suggestedTitle");
});

test("an edited title earns its quality from its length", () => {
  expect(qualityOf("Details of amount spent")).toBe("needs-detail");
  expect(qualityOf("Copies of the bills paid for this road")).toBe("good");
  expect(qualityOf("   ")).toBe("needs-detail");
});
