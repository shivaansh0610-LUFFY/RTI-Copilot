import { expect, test } from "vitest";
import { inspectionRequest, INSPECTION_IDS, suggestsInspection } from "./inspection";
import { ruleIssues } from "./preflight";
import { REPAIR_STARTER } from "../home/problems";

test.each([
  REPAIR_STARTER,
  "The road was relaid in March and now it is broken again",
  "Poor quality work, the new surface has cracks everywhere",
  "Substandard material used, the road is sinking near the drain",
  "They did patchwork last month but it washed away in the rain",
])("suggested for a repair that did not last: %s", (grievance) => {
  expect(suggestsInspection(grievance)).toBe(true);
});

test.each([
  "The streetlights on the road are not working at Lajpat Nagar",
  "There is a pothole near the bus stop on Ring Road",
  "",
])("not suggested for other complaints: %s", (grievance) => {
  expect(suggestsInspection(grievance)).toBe(false);
});

test("the two requests cite their clause of Section 2(j) and fit the API limits", () => {
  const inspect = inspectionRequest("inspect", "PWD", "Last 2 years");
  const samples = inspectionRequest("samples", "PWD", "Last 2 years");

  expect(inspect).toMatchObject({ id: INSPECTION_IDS.inspect, source: "inspection", quality: "good", authority: "PWD", period: "Last 2 years" });
  expect(samples).toMatchObject({ id: INSPECTION_IDS.samples, source: "inspection" });
  expect(inspect.title).toContain("Section 2(j)(i)");
  expect(samples.title).toContain("Section 2(j)(iii)");
  for (const request of [inspect, samples]) {
    expect(request.title.length).toBeLessThanOrEqual(1000);
    expect(request.category.length).toBeLessThanOrEqual(80);
    expect(request.id.length).toBeLessThanOrEqual(40);
    // Even read as an ordinary request, the wording gives the officer no easy excuse.
    expect(ruleIssues({ ...request, source: "custom" })).toEqual([]);
  }
});
