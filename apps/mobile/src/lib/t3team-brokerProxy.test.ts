import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { brokerDeviceAddress, brokerProxyUrl } from "./t3team-brokerProxy";
import {
  brokerProxyFetch,
  brokerProxyWebSocketConstructor,
  registerBrokerProxy,
} from "./t3team-brokerProxyTransport";

const BROKER = "https://ca-nexi-broker.example.test";

afterEach(() => {
  registerBrokerProxy(null);
  vi.unstubAllGlobals();
});

describe("broker device addresses", () => {
  it("maps a device's HTTP and WebSocket endpoints onto the broker's /d/<key> proxy", () => {
    const { httpBaseUrl, wsBaseUrl } = brokerDeviceAddress("h-1B2c");
    expect(brokerProxyUrl(BROKER, `${httpBaseUrl}/api/auth/session`)).toBe(
      `${BROKER}/d/h-1b2c/api/auth/session`,
    );
    expect(brokerProxyUrl(BROKER, `${wsBaseUrl}/ws?wsTicket=t-1`)).toBe(
      "wss://ca-nexi-broker.example.test/d/h-1b2c/ws?wsTicket=t-1",
    );
    expect(brokerProxyUrl("http://localhost:8080/", "wss://41.nexi-broker.invalid/ws")).toBe(
      "ws://localhost:8080/d/41/ws",
    );
  });

  it("leaves every other URL alone", () => {
    expect(brokerProxyUrl(BROKER, "https://desktop.local:3773/api/auth/session")).toBeNull();
    expect(brokerProxyUrl(BROKER, "not a url")).toBeNull();
  });
});

describe("the transport seam", () => {
  const recordingFetch = () => {
    const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      seen.push({ url: input instanceof Request ? input.url : String(input), init });
      return new Response("{}");
    };
    return { seen, fetch };
  };

  it("sends the Entra token to the broker and moves the server's bearer aside", async () => {
    registerBrokerProxy({ brokerUrl: BROKER, token: async () => "entra.token.value" });
    const { seen, fetch } = recordingFetch();
    await brokerProxyFetch(fetch)("https://41.nexi-broker.invalid/api/auth/session", {
      headers: { authorization: "Bearer t3-bearer", cookie: "t3_session=1" },
    });

    const headers = new Headers(seen[0]?.init?.headers);
    expect(seen[0]?.url).toBe(`${BROKER}/d/41/api/auth/session`);
    expect(headers.get("authorization")).toBe("Bearer entra.token.value");
    expect(headers.get("t3-authorization")).toBe("Bearer t3-bearer");
    expect(headers.get("cookie")).toBeNull();
    expect(seen[0]?.init?.credentials).toBe("omit");
  });

  it("passes other requests through untouched", async () => {
    registerBrokerProxy({ brokerUrl: BROKER, token: async () => "entra.token.value" });
    const { seen, fetch } = recordingFetch();
    await brokerProxyFetch(fetch)("https://desktop.local/api", {
      headers: { authorization: "Bearer t3" },
    });
    expect(seen).toEqual([
      { url: "https://desktop.local/api", init: { headers: { authorization: "Bearer t3" } } },
    ]);
  });

  it("never sends a device request to the broker before the gateway registered it", async () => {
    const { seen, fetch } = recordingFetch();
    await brokerProxyFetch(fetch)("https://41.nexi-broker.invalid/api");
    expect(seen.map((request) => request.url)).toEqual(["https://41.nexi-broker.invalid/api"]);
  });

  it("opens a device's WebSocket on the proxy with the last Entra token", async () => {
    const NativeWebSocket = vi.fn();
    vi.stubGlobal("WebSocket", NativeWebSocket);
    registerBrokerProxy({ brokerUrl: BROKER, token: async () => "entra.ws.token" });
    await brokerProxyFetch(recordingFetch().fetch)("https://45.nexi-broker.invalid/api/ticket");
    const make = brokerProxyWebSocketConstructor();
    make("wss://45.nexi-broker.invalid/ws?wsTicket=abc");
    make("wss://desktop.local/ws");
    expect(NativeWebSocket.mock.calls).toEqual([
      [
        "wss://ca-nexi-broker.example.test/d/45/ws?wsTicket=abc",
        undefined,
        { headers: { Authorization: "Bearer entra.ws.token" } },
      ],
      ["wss://desktop.local/ws", undefined],
    ]);
  });
});
