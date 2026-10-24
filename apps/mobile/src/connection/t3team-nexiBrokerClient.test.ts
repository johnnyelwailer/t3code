import { describe, expect, it, vi } from "vite-plus/test";
import { createMobileBrokerClient, mobileBrokerEnabled } from "./t3team-nexiBrokerClient";
import { NexiSignInRequiredError } from "../features/connection/t3team-nexiOAuth";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function fixture(enabled = true) {
  const fetcher = vi.fn<typeof fetch>();
  const start = vi.fn(async () => 12345);
  const token = vi.fn(async () => "entra-user-token");
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
  it("lets a distribution profile enable the broker before any environment is paired", () => {
    expect(mobileBrokerEnabled([], { NEXI_MOBILE_BROKER: true })).toBe(true);
    expect(
      mobileBrokerEnabled([{ featureFlags: { NEXI_MOBILE_BROKER: false } }], {
        NEXI_MOBILE_BROKER: true,
      }),
    ).toBe(true);
    expect(mobileBrokerEnabled([], { NEXI_MOBILE_BROKER: false })).toBe(false);
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
});
