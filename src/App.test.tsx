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
