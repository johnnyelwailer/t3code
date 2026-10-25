import { describe, expect, it, vi } from "vite-plus/test";
import { createMobileBrokerClient, mobileBrokerEnabled } from "./t3team-nexiBrokerClient";
import { createNexiOAuth, NexiSignInRequiredError } from "../features/connection/t3team-nexiOAuth";

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
  it("parks on 'fresh owner token required' instead of retrying forever as an outage", async () => {
    const f = fixture();
    f.fetcher.mockResolvedValue(json({ error: "fresh owner token required" }, 502));
    const failure = await f.client.pair("h-owned").catch((error: unknown) => error);
    expect(failure).toMatchObject({
      _tag: "ConnectionBlockedError",
      reason: "authentication",
      detail: "Sign in again to pair this desktop.",
    });
    // Blocked errors are parked by the supervisor: one request, no retry loop here either.
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    f.fetcher.mockResolvedValueOnce(json({ error: "host not connected" }, 502));
    await expect(f.client.pair("h-owned")).rejects.toMatchObject({
      _tag: "ConnectionTransientError",
      reason: "remote-unavailable",
    });
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
  describe("attaching a saved connection", () => {
    /** The real account logic behind the client, with an in-memory token store and issuer. */
    function withAccount(stored: string | null) {
      let raw = stored;
      const issuer = vi.fn<typeof fetch>();
      const account = createNexiOAuth(
        {
          app: "public-app",
          deviceEndpoint: "https://entra/device",
          tokenEndpoint: "https://entra/token",
        },
        {
          read: async () => raw,
          write: async (value) => {
            raw = value;
          },
          clear: async () => {
            raw = null;
          },
        },
        { fetch: issuer, now: () => 0, sleep: async () => {} },
      );
      const start = vi.fn(async () => 12345);
      const client = createMobileBrokerClient({
        brokerUrl: "https://broker.test",
        enabled: async () => true,
        accessToken: () => account.accessToken(),
        start,
        fetch: vi.fn<typeof fetch>(),
      });
      return { client, issuer, start, account, raw: () => raw };
    }
    const expired = JSON.stringify({
      access_token: "old",
      refresh_token: "refresh",
      expires_in: 3600,
      expiresAt: 0,
    });

    it("blocks on sign-in instead of returning an attachment when signed out", async () => {
      const f = withAccount(null);
      await expect(f.client.attach("h-owned")).rejects.toMatchObject({
        reason: "authentication",
      });
      expect(f.start).not.toHaveBeenCalled();
    });
    it("blocks on sign-in when the refresh grant is rejected", async () => {
      const f = withAccount(expired);
      f.issuer.mockResolvedValueOnce(json({ error: "invalid_grant" }, 400));
      await expect(f.client.attach("h-owned")).rejects.toMatchObject({
        reason: "authentication",
      });
      expect(f.start).not.toHaveBeenCalled();
      expect(f.raw()).toBeNull();
    });
    it("attaches once the expired token refreshes", async () => {
      const f = withAccount(expired);
      f.issuer.mockResolvedValueOnce(json({ access_token: "new", expires_in: 3600 }));
      expect(await f.client.attach("h-owned")).toMatchObject({
        sessionId: "h-owned",
        httpBaseUrl: "http://127.0.0.1:12345",
      });
      expect(f.start).toHaveBeenCalledTimes(1);
    });
    it.each([
      ["a network error", () => Promise.reject(new TypeError("Network request failed"))],
      ["an issuer outage", () => Promise.resolve(json({}, 503))],
    ])("stays retryable after %s and keeps the account signed in", async (_name, respond) => {
      const f = withAccount(expired);
      f.issuer.mockImplementationOnce(respond);
      await expect(f.client.attach("h-owned")).rejects.toMatchObject({ reason: "network" });
      expect(f.start).not.toHaveBeenCalled();
      expect(f.raw()).toContain("refresh");
    });
    it("stays retryable when the account is switched while attaching", async () => {
      const f = fixture();
      f.token.mockRejectedValueOnce(new Error("Sign-in was cancelled."));
      await expect(f.client.attach("h-owned")).rejects.toMatchObject({ reason: "network" });
      expect(f.start).not.toHaveBeenCalled();
    });
    it("does not hand the validated token to the native tunnel", async () => {
      const f = fixture();
      await f.client.attach("h-owned");
      expect(f.start).toHaveBeenCalledWith(
        "h-owned",
        expect.not.stringContaining("entra-user-token"),
      );
    });
  });
});
