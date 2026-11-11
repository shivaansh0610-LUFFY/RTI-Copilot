import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";
import { PROBLEMS } from "./components/home/problems";

function description() {
  return screen.getByPlaceholderText(/The road in front of my house/) as HTMLTextAreaElement;
}

test("opens on the home page, and a problem tile starts the description", () => {
  render(<App />);
  expect(screen.getByText("Complaint ignored? Make them answer.")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: PROBLEMS[2].label }));

  expect(screen.queryByText("Complaint ignored? Make them answer.")).toBeNull();
  expect(description().value).toBe(PROBLEMS[2].starter);
});

test("the plain start button keeps a description already in progress", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /start my rti/i }));
  fireEvent.change(description(), { target: { value: "My own words about the road." } });

  fireEvent.click(screen.getByRole("button", { name: "RTI Copilot" }));
  fireEvent.click(screen.getByRole("button", { name: /start my rti/i }));

  expect(description().value).toBe("My own words about the road.");
});

test("'I got a reply' opens the reply analysis", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /i got a reply/i }));

  expect(screen.getByText("Response Analysis").closest("[hidden]")).toBeNull();
});

test("a drafted application appears in My RTIs, and filing it shows the reply deadline", async () => {
  window.localStorage.clear();
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: /start my rti/i }));
  fireEvent.change(description(), { target: { value: "Big pothole on Ring Road. Nobody repairs it." } });
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

  // The built-in demo questions: answer each, then go on to the requests and the draft.
  await screen.findByText("What time period does this relate to?");
  fireEvent.click(screen.getByRole("button", { name: "Last 6 months" }));
  fireEvent.click(screen.getByRole("button", { name: "No, not sure" }));
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
  await screen.findByText(/has been broken down/);
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
  await screen.findByText(/could use more detail/);
  fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
  await screen.findByText(/If you file today/);

  fireEvent.click(screen.getByRole("button", { name: "My RTIs (1)" }));
  expect(screen.getByText("Big pothole on Ring Road.")).toBeTruthy();
  expect(screen.getByText(/Not filed yet/)).toBeTruthy();

  const today = new Date().toISOString().slice(0, 10);
  fireEvent.change(screen.getByLabelText("Filed on"), { target: { value: today } });
  expect(screen.getByText(/Reply due by .* \(30 days left\)/)).toBeTruthy();
  expect(JSON.parse(window.localStorage.getItem("rti-copilot:my-rtis") ?? "[]")[0].filedOn).toBe(today);
});
