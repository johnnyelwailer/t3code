/**
 * How the phone reaches a device's server through the broker's reverse proxy
 * (`docs/nexi-work/design/broker-hosts.md`, "Proxy" and "Mobile"): every request goes to
 * `<broker>/d/<key>/<path>` with the Entra token in `Authorization` — the broker's own gate — and
 * the server's bearer moved to `T3-Authorization`. Cookies never ride along.
 *
 * Client-runtime builds every endpoint by replacing the base URL's path, so a device is addressed
 * by a path-free synthetic origin, `https://<key>.nexi-broker.invalid`, and only the transport seam
 * turns it into the proxy URL. Anything that bypasses the seam hits a reserved TLD that never
 * resolves, so a server bearer can never leave for another host.
 */

const DEVICE_HOST_SUFFIX = ".nexi-broker.invalid";
const T3_AUTHORIZATION = "t3-authorization";

/** The base URLs the connection layer uses for one broker device. */
export function brokerDeviceAddress(key: string) {
  const host = `${key.toLowerCase()}${DEVICE_HOST_SUFFIX}`;
  return { httpBaseUrl: `https://${host}`, wsBaseUrl: `wss://${host}` } as const;
}

/** The broker proxy URL for a device address, or null when `url` is not one. */
export function brokerProxyUrl(brokerUrl: string, url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!parsed.hostname.endsWith(DEVICE_HOST_SUFFIX)) return null;
  const key = parsed.hostname.slice(0, -DEVICE_HOST_SUFFIX.length);
  const broker = new URL(brokerUrl.replace(/\/+$/, ""));
  const secure = broker.protocol === "https:";
  const scheme =
    parsed.protocol === "wss:" || parsed.protocol === "ws:"
      ? secure
        ? "wss:"
        : "ws:"
      : broker.protocol;
  const basePath = broker.pathname.replace(/\/+$/, "");
  return `${scheme}//${broker.host}${basePath}/d/${key}${parsed.pathname}${parsed.search}`;
}

/** Request headers toward the proxy: Entra for the broker, the server's bearer for the server. */
export function brokerProxyHeaders(headers: Headers, entraToken: string): Headers {
  const next = new Headers(headers);
  const serverAuthorization = next.get("authorization");
  next.delete("authorization");
  next.delete("cookie");
  next.delete(T3_AUTHORIZATION);
  if (serverAuthorization !== null) next.set(T3_AUTHORIZATION, serverAuthorization);
  next.set("authorization", `Bearer ${entraToken}`);
  return next;
}
