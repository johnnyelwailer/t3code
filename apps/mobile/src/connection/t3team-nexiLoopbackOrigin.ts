import { isLoopbackTunnelUrl } from "./t3team-nexiLoopbackFetch";

/**
 * Android WebView documents that talk to a broker tunnel must be loaded from the tunnel's own
 * origin. The usual synthetic `https://localhost/` base makes every request to
 * `http://127.0.0.1:<port>` cross-origin, so the loopback credential cookie is not sent (fetch with
 * "same-origin") or not allowed (SameSite) and the listener refuses it. `http://127.0.0.1` is a
 * secure context, so WebCodecs still works, and being same-origin also removes the mixed-content
 * and CORS dependence of the synthetic origin.
 */
export function loopbackDocumentBaseUrl(httpBase: string): string | null {
  try {
    const url = new URL(httpBase);
    return isLoopbackTunnelUrl(url) ? `${url.origin}/` : null;
  } catch {
    return null;
  }
}

/** The preview document's base URL, from the `access.httpBase` inside its JSON configuration. */
export function previewDocumentBaseUrl(configuration: string, fallback: string): string {
  try {
    const parsed: unknown = JSON.parse(configuration);
    const access =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { access?: unknown }).access
        : null;
    const httpBase =
      typeof access === "object" && access !== null
        ? (access as { httpBase?: unknown }).httpBase
        : null;
    return (typeof httpBase === "string" ? loopbackDocumentBaseUrl(httpBase) : null) ?? fallback;
  } catch {
    return fallback;
  }
}
