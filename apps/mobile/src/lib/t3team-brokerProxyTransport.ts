import type * as Socket from "effect/socket/Socket";

import { brokerProxyHeaders, brokerProxyUrl } from "./t3team-brokerProxy";

/**
 * The transport seam for broker devices: the app's one `fetch` and one WebSocket constructor turn
 * a device address into the broker proxy URL and add the Entra token. Every other URL passes
 * through untouched. The broker gateway registers the broker and the token source, since it owns
 * the account sign-in; the runtime builds this seam before either exists. Unregistered, a device
 * address passes through to its reserved `.invalid` host and fails without leaving the phone.
 */

export interface BrokerProxyRegistration {
  /** https://… of the broker. */
  readonly brokerUrl: string;
  /** A live Entra token for the broker. */
  readonly token: () => Promise<string>;
}

let registration: BrokerProxyRegistration | null = null;
let lastToken: string | null = null;

export const registerBrokerProxy = (next: BrokerProxyRegistration | null) => {
  registration = next;
  lastToken = null;
};

/** A live Entra token for the proxy, remembered for the WebSocket upgrade that follows. */
const proxyToken = async (source: BrokerProxyRegistration): Promise<string> => {
  lastToken = await source.token();
  return lastToken;
};

const proxyTarget = (url: string) =>
  registration === null
    ? null
    : { url: brokerProxyUrl(registration.brokerUrl, url), source: registration };

const requestUrl = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

export function brokerProxyFetch(baseFetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    const target = proxyTarget(requestUrl(input));
    if (target?.url == null) return baseFetch(input, init);
    const original = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
    const headers = brokerProxyHeaders(original, await proxyToken(target.source));
    const request = input instanceof Request ? new Request(target.url, input) : target.url;
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

export function brokerProxyWebSocketConstructor(): Socket.WebSocketConstructor["Service"] {
  return (url, options) => {
    if (options !== undefined && typeof options !== "string" && !Array.isArray(options)) {
      throw new TypeError("WebSocket client options are not supported on mobile.");
    }
    const NativeWebSocket: HeaderWebSocketConstructor = globalThis.WebSocket;
    const target = proxyTarget(url)?.url ?? null;
    if (target === null) return new NativeWebSocket(url, options);
    const headers: Record<string, string> =
      lastToken === null ? {} : { Authorization: `Bearer ${lastToken}` };
    return new NativeWebSocket(target, options, { headers });
  };
}
