export function resolveWsBaseUrl(): string {
  const wsUrl = import.meta.env.VITE_WS_URL?.trim();
  if (wsUrl) return wsUrl;

  const httpUrl = import.meta.env.VITE_HTTP_URL?.trim();
  if (httpUrl) {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  // Desktop: the page origin is a custom protocol (t3code://app) which cannot
  // carry WebSocket traffic. Use the real backend URL from the bridge (sync IPC).
  if (typeof window !== "undefined" && window.desktopBridge) {
    const bootstraps = window.desktopBridge.getLocalEnvironmentBootstraps();
    const primary = bootstraps.find((b) => b.id === "primary");
    if (primary?.wsBaseUrl) return primary.wsBaseUrl;
    if (primary?.httpBaseUrl) {
      const url = new URL(primary.httpBaseUrl);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/";
      return url.toString();
    }
  }

  // Dev and self-hosted web are single-origin: Vite (dev) and the server (prod)
  // both route /api and /ws from the page origin. A hardcoded port here pointed
  // t3team backend calls at dead localhost:3773 whenever the server ran on a
  // derived port, which surfaced as a permanent "You appear to be offline".
  if (typeof window !== "undefined" && window.location.host) {
    // Custom protocol (e.g. t3code://app in desktop): use origin as-is so
    // Electron's protocol handler proxies requests to the local backend.
    if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
      return window.location.origin;
    }
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${window.location.host}`;
  }

  return "ws://localhost:3773";
}
