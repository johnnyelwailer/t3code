import { describe, expect, it, vi } from "vite-plus/test";
import { createMobileBrokerClient, mobileBrokerEnabled } from "./t3team-nexiBrokerClient";
import {
  isSessionEndedFailure,
  type ConnectionAttemptError,
} from "@t3tools/client-runtime/connection";
import { NexiSignInRequiredError } from "../features/connection/t3team-nexiOAuth";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function fixture(enabled = true) {
  const fetcher = vi.fn<typeof fetch>();
  const start = vi.fn(async () => 12345);
  const token = vi.fn<(options?: { readonly fresh?: boolean }) => Promise<string>>(
    async () => "entra-user-token",
  );
  const client = createMobileBrokerClient({
    brokerUrl: "https://broker.test",
    enabled: async () => enabled,
    accessToken: token,
    start,
    fetch: fetcher,
  });
  return { client, fetcher, start, token };
}
describe("Android broker connection", () => {
  it("retries identity outages but blocks expired sign-in grants", async () => {
    const f = fixture();
    f.token.mockRejectedValueOnce(new Error("offline"));
    await expect(f.client.hosts()).rejects.toMatchObject({ reason: "network" });
    f.token.mockRejectedValueOnce(new NexiSignInRequiredError("Sign in again"));
    await expect(f.client.hosts()).rejects.toMatchObject({ reason: "authentication" });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("fails closed unless a paired environment explicitly enables the runtime flag", async () => {
    expect(mobileBrokerEnabled([])).toBe(false);
    expect(mobileBrokerEnabled([{}, { featureFlags: { NEXI_MOBILE_BROKER: false } }])).toBe(false);
    expect(mobileBrokerEnabled([{ featureFlags: { NEXI_MOBILE_BROKER: true } }])).toBe(true);
    const f = fixture(false);
    await expect(f.client.hosts()).rejects.toMatchObject({ reason: "unsupported" });
    await expect(f.client.attach("h-owned")).rejects.toMatchObject({ reason: "unsupported" });
    await expect(f.client.pair("h-owned")).rejects.toMatchObject({ reason: "unsupported" });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.start).not.toHaveBeenCalled();
  });
  it("lists owned hosts with Entra identity and pairs the selected host's prefixed session", async () => {
    const f = fixture();
    const host = { id: "owned", label: "My desktop", online: true };
    f.fetcher
      .mockResolvedValueOnce(json({ hosts: [host] }))
      .mockResolvedValueOnce(json({ credential: "once" }));
    expect(await f.client.hosts()).toEqual([host]);
    expect(await f.client.pair("h-owned")).toBe("once");
    expect(f.fetcher.mock.calls[0]![0]).toBe("https://broker.test/v1/hosts");
    expect(f.fetcher.mock.calls[1]![0]).toBe("https://broker.test/v1/sessions/h-owned/pairing");
    expect(f.fetcher.mock.calls[1]![1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer entra-user-token" },
    });
    expect(f.token).toHaveBeenCalledTimes(2);
  });
  it("asks for a freshly issued Entra token only when pairing: the host refuses one older than ten minutes", async () => {
    const f = fixture();
    f.fetcher
      .mockResolvedValueOnce(json({ hosts: [] }))
      .mockResolvedValueOnce(json({ credential: "once" }));
    await f.client.hosts();
    await f.client.pair("h-owned");
    expect(f.token.mock.calls).toEqual([[undefined], [{ fresh: true }]]);
  });
  it("sends the refreshed token to the broker and never pairs on a failed refresh", async () => {
    const f = fixture();
    f.token.mockImplementation(async (options) =>
      options?.fresh ? "fresh-token" : "cached-token",
    );
    f.fetcher.mockResolvedValueOnce(json({ credential: "once" }));
    await f.client.pair("h-owned");
    expect(f.fetcher.mock.calls[0]![1]).toMatchObject({
      headers: { Authorization: "Bearer fresh-token" },
    });
    f.token.mockRejectedValueOnce(new NexiSignInRequiredError("Sign in again"));
    await expect(f.client.pair("h-owned")).rejects.toMatchObject({ reason: "authentication" });
    f.token.mockRejectedValueOnce(new Error("offline"));
    await expect(f.client.pair("h-owned")).rejects.toMatchObject({ reason: "network" });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("discovers environment identity through the native tunnel without leaking Entra to the host", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(json({ environmentId: "env-desktop" }));
    expect(await f.client.discoverHost({ id: "owned", label: "My desktop", online: true })).toEqual(
      {
        environmentId: "env-desktop",
        sessionId: "h-owned",
        label: "My desktop",
        httpBaseUrl: "http://127.0.0.1:12345",
        wsBaseUrl: "ws://127.0.0.1:12345",
      },
    );
    expect(f.start).toHaveBeenCalledWith(
      "h-owned",
      "wss://broker.test/v1/client/stream?session=h-owned",
    );
    expect(f.fetcher.mock.calls[0]![0]).toBe("http://127.0.0.1:12345/.well-known/t3/environment");
    expect(f.fetcher.mock.calls[0]![1]?.headers).toBeUndefined();
  });
  it("refuses offline hosts and malformed session ids", async () => {
    const f = fixture();
    await expect(
      f.client.discoverHost({ id: "owned", label: "Desktop", online: false }),
    ).rejects.toThrow("offline");
    await expect(f.client.attach("../foreign")).rejects.toThrow("Invalid");
    await expect(f.client.pair("../foreign")).rejects.toThrow("Invalid");
    expect(f.start).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 403])("classifies broker refusal %s as authentication blocked", async (status) => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(json({}, status));
    await expect(f.client.hosts()).rejects.toMatchObject({ reason: "authentication" });
  });
  it("classifies host support being disabled as retryable remote availability", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(json({}, 404));
    await expect(f.client.hosts()).rejects.toMatchObject({ reason: "remote-unavailable" });
  });
  it("rejects malformed host lists and pairing replies", async () => {
    const f = fixture();
    f.fetcher
      .mockResolvedValueOnce(json({ hosts: [{ id: "x", online: "yes" }] }))
      .mockResolvedValueOnce(json({ credential: "" }));
    await expect(f.client.hosts()).rejects.toThrow();
    await expect(f.client.pair("h-x")).rejects.toThrow();
  });
  describe("pairing failures", () => {
    const rows = [
      [400, "ConnectionBlockedError", "configuration"],
      [401, "ConnectionBlockedError", "authentication"],
      [403, "ConnectionBlockedError", "authentication"],
      [410, "ConnectionBlockedError", "configuration"],
      [429, "ConnectionTransientError", "remote-unavailable"],
      [500, "ConnectionTransientError", "remote-unavailable"],
      [502, "ConnectionTransientError", "remote-unavailable"],
      [503, "ConnectionTransientError", "remote-unavailable"],
      [504, "ConnectionTransientError", "remote-unavailable"],
    ] as const;
    it.each(rows)("classifies HTTP %s as %s (%s)", async (status, tag, reason) => {
      const f = fixture();
      f.fetcher.mockResolvedValueOnce(json({ error: "broker says no" }, status));
      await expect(f.client.pair("h-owned")).rejects.toMatchObject({
        _tag: tag,
        reason,
        detail: "broker says no",
        httpStatus: status,
      });
    });
    it("treats 404 for a host session as the desktop being offline: the broker deletes it on host.down", async () => {
      const f = fixture();
      f.fetcher.mockResolvedValueOnce(json({ error: "no such session" }, 404));
      await expect(f.client.pair("h-owned")).rejects.toMatchObject({
        _tag: "ConnectionTransientError",
        reason: "remote-unavailable",
        httpStatus: 404,
        detail: expect.stringContaining("offline or reconnecting"),
      });
    });
    it("treats 404 for a cloud session as ended, the state the UI already renders", async () => {
      const f = fixture();
      f.fetcher.mockResolvedValueOnce(json({ error: "no such session" }, 404));
      const failure = await f.client.pair("run-123").catch((error: unknown) => error);
      expect(isSessionEndedFailure(failure as ConnectionAttemptError)).toBe(true);
      expect(failure).toMatchObject({ _tag: "ConnectionBlockedError", detail: "no such session" });
    });
    it("classifies a fetch that never answered as a transient network or timeout failure", async () => {
      const f = fixture();
      f.fetcher.mockRejectedValueOnce(new TypeError("Network request failed"));
      await expect(f.client.pair("h-owned")).rejects.toMatchObject({
        _tag: "ConnectionTransientError",
        reason: "network",
      });
      const timeout = new Error("aborted");
      timeout.name = "TimeoutError";
      f.fetcher.mockRejectedValueOnce(timeout);
      await expect(f.client.pair("h-owned")).rejects.toMatchObject({
        _tag: "ConnectionTransientError",
        reason: "timeout",
      });
    });
    it("shows the broker's error text instead of a bare status, bounded and without control characters", async () => {
      const f = fixture();
      f.fetcher.mockResolvedValueOnce(json({ error: "fresh owner token required" }, 502));
      await expect(f.client.pair("h-owned")).rejects.toThrow("fresh owner token required");
      f.fetcher.mockResolvedValueOnce(json({ error: "host not connected" }, 502));
      await expect(f.client.pair("h-owned")).rejects.toThrow("host not connected");
      f.fetcher.mockResolvedValueOnce(json({ error: `a\u0000b\n${"x".repeat(500)}` }, 400));
      const bounded = await f.client.pair("h-owned").catch((error: Error) => error.message);
      expect(bounded).toMatch(/^a b x{196}$/);
    });
    it.each([
      ["a non-JSON body", () => new Response("<html>Bad gateway</html>", { status: 502 })],
      ["a JSON body without error", () => json({ message: "x" }, 502)],
      ["a non-string error", () => json({ error: { nested: true } }, 502)],
      ["a blank error", () => json({ error: "  " }, 502)],
    ])("falls back to the status text for %s", async (_name, response) => {
      const f = fixture();
      f.fetcher.mockResolvedValueOnce(response());
      await expect(f.client.pair("h-owned")).rejects.toThrow(
        "The broker is unavailable (HTTP 502)",
      );
    });
    it("keeps a missing host list endpoint retryable: 404 only means definitive for a session", async () => {
      const f = fixture();
      f.fetcher.mockResolvedValueOnce(json({ error: "not found" }, 404));
      await expect(f.client.hosts()).rejects.toMatchObject({ reason: "remote-unavailable" });
    });
  });
  it("never receives or displays a loopback credential: the native side owns it", async () => {
    const f = fixture();
    const attached = await f.client.attach("h-owned");
    expect(f.start.mock.calls[0]).toHaveLength(2);
    expect(attached).toEqual({
      sessionId: "h-owned",
      httpBaseUrl: "http://127.0.0.1:12345",
      wsBaseUrl: "ws://127.0.0.1:12345",
    });
    expect(JSON.stringify(attached)).not.toMatch(/secret|token|credential|@/i);
  });
});
