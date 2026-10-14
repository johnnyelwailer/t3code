import type * as Socket from "effect/socket/Socket";

import { brokerProxyHeaders, brokerProxyUrl } from "./t3team-brokerProxy";

/**
 * The transport seam for broker devices: the app's one `fetch` and one WebSocket constructor turn
 * a device address into the broker proxy URL and add the Entra token. Every other URL passes
 * through untouched. The token source is registered by the broker gateway, which owns the account
 * sign-in, so this module stays free of it (the runtime imports it before the account exists).
 */

type TokenSource = () => Promise<string>;

let tokenSource: TokenSource | null = null;
let lastToken: string | null = null;

export const setBrokerProxyTokenSource = (source: TokenSource | null) => {
  tokenSource = source;
  lastToken = null;
};

/** A live Entra token for the proxy, remembered for the WebSocket upgrade that follows. */
export const brokerProxyToken = async (): Promise<string> => {
  if (tokenSource === null) throw new Error("Sign in with Microsoft to reach this device.");
  lastToken = await tokenSource();
  return lastToken;
};

const requestUrl = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

export function brokerProxyFetch(
  baseFetch: typeof globalThis.fetch,
  brokerUrl: string | null,
): typeof globalThis.fetch {
  if (brokerUrl === null) return baseFetch;
  return async (input, init) => {
    const target = brokerProxyUrl(brokerUrl, requestUrl(input));
    if (target === null) return baseFetch(input, init);
    const original = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
    const headers = brokerProxyHeaders(original, await brokerProxyToken());
    const request = input instanceof Request ? new Request(target, input) : target;
    return baseFetch(request, { ...init, headers, credentials: "omit" });
  };
}

/** React Native's WebSocket takes request headers as a third argument; browsers' does not. */
interface HeaderWebSocketConstructor {
  new (
    url: string,
    protocols?: string | Array<string>,
    options?: { readonly headers: Readonly<Record<string, string>> },
  ): WebSocket;
}

export function brokerProxyWebSocketConstructor(
  brokerUrl: string | null,
): Socket.WebSocketConstructor["Service"] {
  const NativeWebSocket: HeaderWebSocketConstructor = globalThis.WebSocket;
  return (url, options) => {
    if (options !== undefined && typeof options !== "string" && !Array.isArray(options)) {
      throw new TypeError("WebSocket client options are not supported on mobile.");
    }
    const target = brokerUrl === null ? null : brokerProxyUrl(brokerUrl, url);
    if (target === null) return new NativeWebSocket(url, options);
    const headers: Record<string, string> =
      lastToken === null ? {} : { Authorization: `Bearer ${lastToken}` };
    return new NativeWebSocket(target, options, { headers });
  };
}
