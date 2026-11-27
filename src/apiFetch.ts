// The free API server sleeps after 15 minutes without visitors and takes up to about a minute
// to wake. Meanwhile a request can fail outright ("Failed to fetch") or get a 502/503/504 from
// the host's proxy (the API itself never answers with those).
//
// Then, instead of blindly sending the request again, the server is asked whether it is up
// (GET /health) until it answers. If it answered straight away, it was never asleep: the failure
// is something else (offline, a blocked address), so it is shown at once. If it was down and
// woke up, the request could not have been handled, so it is sent once more; that keeps a POST
// from running twice.
const WAKE_CHECK_EVERY_MS = 3000;
const WAKE_LIMIT_MS = 90_000;
const PROXY_STATUSES = new Set([502, 503, 504]);

export interface WakeTiming {
  checkEveryMs: number;
  limitMs: number;
}

const TIMING: WakeTiming =
  import.meta.env.MODE === "test"
    ? { checkEveryMs: 0, limitMs: 0 }
    : { checkEveryMs: WAKE_CHECK_EVERY_MS, limitMs: WAKE_LIMIT_MS };

export async function apiFetch(input: string, init?: RequestInit, timing: WakeTiming = TIMING): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if ((await waitForServer(input, timing)) !== "woke") throw error;
    return fetch(input, init);
  }
  if (!PROXY_STATUSES.has(response.status)) return response;
  if ((await waitForServer(input, timing)) !== "woke") return response;
  return fetch(input, init);
}

// "up": answered at the first check. "woke": answered after failing at least once. "down": never.
async function waitForServer(input: string, timing: WakeTiming): Promise<"up" | "woke" | "down"> {
  const health = `${new URL(input).origin}/health`;
  const started = Date.now();
  for (let check = 0; ; check++) {
    try {
      const answer = await fetch(health, { cache: "no-store" });
      if (answer.ok) return check === 0 ? "up" : "woke";
    } catch {
      // Still asleep, or unreachable: check again until the limit.
    }
    if (Date.now() - started >= timing.limitMs) return "down";
    await new Promise((resolve) => setTimeout(resolve, timing.checkEveryMs));
  }
}
