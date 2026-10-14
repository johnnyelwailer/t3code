import { MOCK_BROKER } from "./t3team-mockBroker.fixtures";

/**
 * The broker's reverse proxy as the design specifies it (`/d/<key>/*`, Entra in `Authorization`,
 * the server bearer in `T3-Authorization`, cookies stripped) in front of each device's server
 * descriptor — a `fetch` the app's transport seam can sit on. `enabled: false` is a broker that
 * does not proxy for phones yet (every `/d/` path 404s).
 */
export interface MockProxyState {
  enabled: boolean;
  readonly devices: Record<string, { readonly environmentId: string; readonly label: string }>;
  readonly requests: Array<{
    readonly url: string;
    readonly authorization: string | null;
    readonly t3Authorization: string | null;
    readonly cookie: string | null;
    readonly credentials: RequestCredentials | undefined;
  }>;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function makeMockBrokerProxy(input: {
  readonly acceptsToken: (token: string) => boolean;
  readonly devices?: MockProxyState["devices"];
  readonly enabled?: boolean;
}) {
  const state: MockProxyState = {
    enabled: input.enabled ?? true,
    devices: input.devices ?? {},
    requests: [],
  };
  const fetch: typeof globalThis.fetch = async (request, init) => {
    const url = request instanceof Request ? request.url : String(request);
    const headers = new Headers(init?.headers);
    state.requests.push({
      url,
      authorization: headers.get("authorization"),
      t3Authorization: headers.get("t3-authorization"),
      cookie: headers.get("cookie"),
      credentials: init?.credentials,
    });
    const parsed = new URL(url);
    const route = parsed.pathname.match(/^\/d\/([\w-]+)(\/.*)$/);
    if (parsed.origin !== MOCK_BROKER || route === null || !state.enabled) {
      return json(404, { error: "not found" });
    }
    const bearer = headers.get("authorization")?.replace(/^Bearer /, "");
    if (bearer === undefined || !input.acceptsToken(bearer)) {
      return json(401, { error: "unauthorized" });
    }
    const device = state.devices[route[1] ?? ""];
    if (device === undefined) return json(404, { error: "no such device" });
    if (route[2] === "/.well-known/t3/environment") {
      return json(200, {
        ...device,
        platform: { os: "linux", arch: "x64" },
        serverVersion: "1.0.0",
      });
    }
    return json(404, { error: "not found" });
  };
  return { state, fetch };
}
