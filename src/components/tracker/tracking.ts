import type { InformationRequest } from "../../types";

// One application the citizen drafted, kept in this browser so they can come back when the
// reply is due. Nothing here is sent anywhere.
export interface TrackedRti {
  key: string; // the case id, or a local id when the app runs without a backend
  caseId?: string;
  title: string;
  createdAt: string; // ISO timestamp of the draft
  requests: InformationRequest[];
  draftText: string;
  filedOn?: string; // YYYY-MM-DD, entered by the citizen after filing
  registrationNo?: string;
}

const STORAGE_KEY = "rti-copilot:my-rtis";
const REPLY_DAYS = 30; // Section 7(1)
const APPEAL_DAYS = 30; // Section 19(1), counted from the end of the reply period

// Browser storage can be missing or refuse (private windows, blocked site data): the app must
// work without it, so every access is guarded.
export function loadRtis(): TrackedRti[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as TrackedRti[]) : [];
  } catch {
    return [];
  }
}

export function saveRtis(rtis: TrackedRti[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rtis));
  } catch {
    // Not saved: the list still works until the page is closed.
  }
}

// The first sentence of the grievance, without the map's "Location:" line, as a short title.
export function titleFrom(grievance: string): string {
  const text = grievance
    .split("\n")
    .filter((line) => !line.startsWith("Location:"))
    .join(" ")
    .trim();
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length > 90 ? `${sentence.slice(0, 87).trimEnd()}…` : sentence || "RTI application";
}

// Insert, or replace the entry with the same key (keeping what the citizen entered about filing).
export function upsertRti(rtis: TrackedRti[], next: TrackedRti): TrackedRti[] {
  const existing = rtis.find((rti) => rti.key === next.key);
  const merged = existing
    ? { ...next, filedOn: existing.filedOn, registrationNo: existing.registrationNo }
    : next;
  return [merged, ...rtis.filter((rti) => rti.key !== next.key)];
}

function addDays(isoDate: string, days: number): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day + days);
}

function wholeDaysBetween(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export type DeadlineStatus =
  | { kind: "not-filed" }
  | { kind: "waiting"; replyDue: Date; daysLeft: number }
  | { kind: "appeal-window"; replyDue: Date; appealUntil: Date; daysLeft: number }
  | { kind: "appeal-closed"; appealUntil: Date };

// Where the application stands on `today`, if no reply has come yet.
export function deadlineStatus(filedOn: string | undefined, today: Date = new Date()): DeadlineStatus {
  if (!filedOn || !/^\d{4}-\d{2}-\d{2}$/.test(filedOn)) return { kind: "not-filed" };
  const replyDue = addDays(filedOn, REPLY_DAYS);
  const appealUntil = addDays(filedOn, REPLY_DAYS + APPEAL_DAYS);
  const toReply = wholeDaysBetween(today, replyDue);
  if (toReply >= 0) return { kind: "waiting", replyDue, daysLeft: toReply };
  const toAppeal = wholeDaysBetween(today, appealUntil);
  if (toAppeal >= 0) return { kind: "appeal-window", replyDue, appealUntil, daysLeft: toAppeal };
  return { kind: "appeal-closed", appealUntil };
}
