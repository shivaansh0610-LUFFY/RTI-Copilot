import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./apiFetch";

describe("apiFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the request again when the sleeping server drops it", async () => {
    const answer = new Response("ok");
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(answer);
    vi.stubGlobal("fetch", fetch);

    await expect(apiFetch("https://api.example/health", undefined, [0])).resolves.toBe(answer);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last try", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetch);

    await expect(apiFetch("https://api.example/health", undefined, [0, 0])).rejects.toThrow("Failed to fetch");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a real answer with an error status", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("no", { status: 422 }));
    vi.stubGlobal("fetch", fetch);

    expect((await apiFetch("https://api.example/x", undefined, [0])).status).toBe(422);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
