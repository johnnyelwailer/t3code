import { EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { NexiSignInRequiredError } from "../features/connection/t3team-nexiOAuth";
import {
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";

const Host = Schema.Struct({
  id: Schema.NonEmptyString,
  label: Schema.String,
  online: Schema.Boolean,
});
const Hosts = Schema.Struct({ hosts: Schema.Array(Host) });
const Descriptor = Schema.Struct({ environmentId: EnvironmentId });
const Pairing = Schema.Struct({ credential: Schema.NonEmptyString });
const decodeHosts = Schema.decodeUnknownSync(Hosts);
const decodePairing = Schema.decodeUnknownSync(Pairing);
const decodeDescriptor = Schema.decodeUnknownSync(Descriptor);
export type NexiHost = typeof Host.Type;

export function mobileBrokerEnabled(
  configs: Iterable<{ featureFlags?: Readonly<Record<string, boolean>> }>,
) {
  return [...configs].some((config) => config.featureFlags?.NEXI_MOBILE_BROKER === true);
}

export function createMobileBrokerClient(deps: {
  brokerUrl: string;
  enabled: () => Promise<boolean>;
  accessToken: () => Promise<string>;
  start: (session: string, streamUrl: string) => Promise<number>;
  fetch: typeof fetch;
}) {
  const checkEnabled = async () => {
    if (!(await deps.enabled()))
      throw new ConnectionBlockedError({
        reason: "unsupported",
        detail: "Enable Nexi Work mobile broker in Settings → Features on a paired environment.",
      });
  };
  /** The signed-in account's token, with sign-in failures classified for the connection supervisor. */
  const acquireToken = async () => {
    try {
      return await deps.accessToken();
    } catch (error) {
      if (error instanceof NexiSignInRequiredError)
        throw new ConnectionBlockedError({
          reason: "authentication",
          detail: "Sign in to Nexplore again.",
        });
      throw new ConnectionTransientError({
        reason: "network",
        detail: "Nexplore sign-in could not be refreshed. Retrying when available.",
      });
    }
  };
  const request = async (path: string, method = "GET") => {
    await checkEnabled();
    const token = await acquireToken();
    const response = await deps.fetch(`${deps.brokerUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 401 || response.status === 403)
      throw new ConnectionBlockedError({
        reason: "authentication",
        detail: "The broker refused access. Sign in with the account that owns this host.",
      });
    if (!response.ok)
      throw new ConnectionTransientError({
        reason: "remote-unavailable",
        detail: `The broker is unavailable (HTTP ${response.status}). Check host enrollment and broker host support.`,
      });
    return response.json();
  };
  const attach = async (sessionId: string) => {
    await checkEnabled();
    if (!/^[\w-]{1,128}$/.test(sessionId)) throw new Error("Invalid broker session.");
    // A saved connection reattaches without any broker request. Without this check an expired or
    // revoked sign-in only surfaces when the native tunnel finds no token and closes the socket, which
    // the supervisor retries as a network failure instead of asking the user to sign in. The token is
    // not passed on: the tunnel still asks for a fresh one per stream.
    await acquireToken();
    const stream = new URL("/v1/client/stream", deps.brokerUrl);
    stream.protocol = "wss:";
    stream.searchParams.set("session", sessionId);
    const port = await deps.start(sessionId, stream.toString());
    return {
      sessionId,
      httpBaseUrl: `http://127.0.0.1:${port}`,
      wsBaseUrl: `ws://127.0.0.1:${port}`,
    };
  };
  return {
    checkEnabled,
    hosts: async () => decodeHosts(await request("/v1/hosts")).hosts,
    attach,
    pair: async (sessionId: string) => {
      if (!/^[\w-]{1,128}$/.test(sessionId)) throw new Error("Invalid broker session.");
      return decodePairing(await request(`/v1/sessions/${sessionId}/pairing`, "POST")).credential;
    },
    discoverHost: async (host: NexiHost) => {
      if (!host.online) throw new Error("This desktop host is offline.");
      // The broker prefixes enrolled host ids in its shared session namespace (hosts.ts).
      const attached = await attach(`h-${host.id}`);
      const response = await deps.fetch(`${attached.httpBaseUrl}/.well-known/t3/environment`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error("The desktop host did not identify its environment.");
      const descriptor = decodeDescriptor(await response.json());
      return { ...attached, environmentId: descriptor.environmentId, label: host.label };
    },
  };
}
