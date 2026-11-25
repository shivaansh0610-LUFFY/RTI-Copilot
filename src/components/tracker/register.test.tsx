import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import MyRtis from "./MyRtis";
import type { TrackedRti } from "./tracking";

function filedDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const entry = (key: string, title: string, filedOn?: string): TrackedRti => ({
  key,
  title,
  createdAt: new Date().toISOString(),
  requests: [],
  draftText: "",
  filedOn,
});

test("the register numbers the oldest first and stamps each deadline", () => {
  // Newest first, as App keeps them.
  const rtis = [entry("c", "Drain left open", undefined), entry("b", "Streetlights dead", filedDaysAgo(10)), entry("a", "Pothole", filedDaysAgo(40))];
  render(<MyRtis rtis={rtis} onUpdate={() => {}} onDelete={() => {}} onAnalyse={() => {}} onStart={() => {}} />);

  const rows = within(screen.getByRole("list", { name: "Your applications" })).getAllByRole("listitem");
  expect(within(rows[0]).getByText("No. 3")).toBeTruthy();
  expect(within(rows[2]).getByText("No. 1")).toBeTruthy();

  expect(within(rows[0]).getByText("Not filed")).toBeTruthy();
  expect(within(rows[1]).getByText(/^Reply due \d+ \w+$/)).toBeTruthy();
  expect(within(rows[1]).getByText(/\(20 days left\)/)).toBeTruthy();
  expect(within(rows[2]).getByText("Reply overdue")).toBeTruthy();
  expect(within(rows[2]).getByText(/You can file a first appeal/)).toBeTruthy();
});

test("with nothing drafted yet it offers to start", () => {
  render(<MyRtis rtis={[]} onUpdate={() => {}} onDelete={() => {}} onAnalyse={() => {}} onStart={() => {}} />);
  expect(screen.getByText(/No applications yet/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Start my RTI" })).toBeTruthy();
});
