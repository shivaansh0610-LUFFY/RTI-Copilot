import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./apiFetch";

const API = "https://api.example/cases";
const HEALTH = "https://api.example/health";
const QUICK = { checkEveryMs: 0, limitMs: 1000 };

// A fake network: each call to a URL takes the next answer from its list (the last one repeats).
// An Error is thrown, as fetch does on a network failure; a number is an HTTP status.
function network(answers: Record<string, (number | Error)[]>) {
  const calls: string[] = [];
  const used: Record<string, number> = {};
  const fetch = vi.fn(async (url: string) => {
    calls.push(url === HEALTH ? "health" : "request");
    const list = answers[url];
    const answer = list[Math.min(used[url] ?? 0, list.length - 1)];
    used[url] = (used[url] ?? 0) + 1;
    if (answer instanceof Error) throw answer;
    return new Response(String(answer), { status: answer });
  });
  vi.stubGlobal("fetch", fetch);
  return calls;
}

const dropped = () => new TypeError("Failed to fetch");

describe("apiFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the request once more after the sleeping server wakes up", async () => {
    const calls = network({ [API]: [dropped(), 201], [HEALTH]: [dropped(), dropped(), 200] });

    expect((await apiFetch(API, { method: "POST" }, QUICK)).status).toBe(201);
    expect(calls).toEqual(["request", "health", "health", "health", "request"]);
  });

  it("does not resend a POST when the server was awake all along", async () => {
    // The request may have been handled; sending it again could create a second record.
    const calls = network({ [API]: [dropped()], [HEALTH]: [200] });

    await expect(apiFetch(API, { method: "POST" }, QUICK)).rejects.toThrow("Failed to fetch");
    expect(calls).toEqual(["request", "health"]);
  });

  it("gives up when the server never answers", async () => {
    const calls = network({ [API]: [dropped()], [HEALTH]: [dropped()] });

    await expect(apiFetch(API, undefined, { checkEveryMs: 0, limitMs: 0 })).rejects.toThrow("Failed to fetch");
    expect(calls).toEqual(["request", "health"]);
  });

  it("treats a 503 from the host's proxy as waking up", async () => {
    const calls = network({ [API]: [503, 200], [HEALTH]: [503, 200] });

    expect((await apiFetch(API, undefined, QUICK)).status).toBe(200);
    expect(calls).toEqual(["request", "health", "health", "request"]);
  });

  it("returns a 502 as it is when the server is up", async () => {
    const calls = network({ [API]: [502], [HEALTH]: [200] });

    expect((await apiFetch(API, undefined, QUICK)).status).toBe(502);
    expect(calls).toEqual(["request", "health"]);
  });

  it("returns any other answer straight away", async () => {
    const calls = network({ [API]: [422], [HEALTH]: [200] });

    expect((await apiFetch(API, undefined, QUICK)).status).toBe(422);
    expect(calls).toEqual(["request"]);
  });
});
