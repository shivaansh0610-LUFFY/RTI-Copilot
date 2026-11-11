import { beforeEach, expect, test } from "vitest";
import { deadlineStatus, loadRtis, saveRtis, titleFrom, upsertRti, type TrackedRti } from "./tracking";

const ENTRY: TrackedRti = {
  key: "case-1",
  caseId: "case-1",
  title: "Pothole",
  createdAt: "2026-11-11T08:00:00.000Z",
  requests: [],
  draftText: "1. x",
};

beforeEach(() => window.localStorage.clear());

test("deadlines count 30 days to the reply and 30 more to appeal", () => {
  const filed = "2026-11-11";
  expect(deadlineStatus(undefined)).toEqual({ kind: "not-filed" });

  const waiting = deadlineStatus(filed, new Date(2026, 10, 21));
  expect(waiting.kind).toBe("waiting");
  if (waiting.kind === "waiting") {
    expect(waiting.daysLeft).toBe(20);
    expect(waiting.replyDue).toEqual(new Date(2026, 11, 11));
  }

  const due = deadlineStatus(filed, new Date(2026, 11, 11));
  expect(due.kind === "waiting" && due.daysLeft).toBe(0);

  const overdue = deadlineStatus(filed, new Date(2026, 11, 12));
  expect(overdue.kind).toBe("appeal-window");
  if (overdue.kind === "appeal-window") {
    expect(overdue.appealUntil).toEqual(new Date(2027, 0, 10));
    expect(overdue.daysLeft).toBe(29);
  }

  expect(deadlineStatus(filed, new Date(2027, 0, 11)).kind).toBe("appeal-closed");
});

test("a redrafted application keeps what the citizen entered about filing", () => {
  const filed = upsertRti([], { ...ENTRY, filedOn: "2026-11-11", registrationNo: "DPWD/R/2026/123" });
  const redrafted = upsertRti(filed, { ...ENTRY, draftText: "1. y (Hindi)" });

  expect(redrafted).toHaveLength(1);
  expect(redrafted[0].draftText).toBe("1. y (Hindi)");
  expect(redrafted[0].registrationNo).toBe("DPWD/R/2026/123");
});

test("the list survives a reload, and bad stored data is ignored", () => {
  saveRtis([ENTRY]);
  expect(loadRtis()).toEqual([ENTRY]);

  window.localStorage.setItem("rti-copilot:my-rtis", "{not json");
  expect(loadRtis()).toEqual([]);
});

test("titles are the first sentence, without the map's location line", () => {
  expect(titleFrom("Big pothole on Ring Road. It is dangerous.\n\nLocation: Ring Road (28.5, 77.2)")).toBe(
    "Big pothole on Ring Road.",
  );
  expect(titleFrom("x".repeat(200))).toHaveLength(88);
});
