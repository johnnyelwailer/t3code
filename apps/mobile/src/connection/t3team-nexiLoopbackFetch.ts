/**
 * The native broker module authenticates loopback connections with a cookie in the app's cookie
 * jar. React Native's fetch bypasses that jar for `credentials: "omit"`, which bearer-authenticated
 * connections use for device screenshots and preview uploads, so those requests would be refused.
 * For requests to a live tunnel's loopback port only, "omit" becomes "same-origin": no other
 * origin is affected, and the loopback origin is the app's own tunnel to the user's host.
 */
const loopbackPorts = new Set<number>();
let installed = false;

export const registerLoopbackPort = (port: number) => void loopbackPorts.add(port);
export const clearLoopbackPorts = () => loopbackPorts.clear();

function isLoopbackTunnel(input: Parameters<typeof fetch>[0]) {
  try {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    return (
      url.protocol === "http:" &&
      url.hostname === "127.0.0.1" &&
      loopbackPorts.has(Number(url.port))
    );
  } catch {
    return false;
  }
}

export function withLoopbackCookies(base: typeof fetch): typeof fetch {
  return (input, init) =>
    init?.credentials === "omit" && isLoopbackTunnel(input)
      ? base(input, { ...init, credentials: "same-origin" })
      : base(input, init);
}

export function installLoopbackCookieFetch() {
  if (installed) return;
  installed = true;
  globalThis.fetch = withLoopbackCookies(globalThis.fetch);
}
