// The free API server sleeps after 15 minutes without visitors and takes up to a minute to
// wake. A request sent meanwhile can fail with a network error ("Failed to fetch"), so such a
// request is sent again a few times before giving up. An answer with an HTTP error status is a
// real answer and is not retried.
const RETRY_DELAYS_MS = import.meta.env.MODE === "test" ? [] : [3000, 8000, 15000, 25000];

export async function apiFetch(input: string, init?: RequestInit, delays: number[] = RETRY_DELAYS_MS): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      if (attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}
