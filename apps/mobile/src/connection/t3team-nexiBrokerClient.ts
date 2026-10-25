import { EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { NexiSignInRequiredError } from "../features/connection/t3team-nexiOAuth";
import {
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";
import {
  brokerErrorText,
  classifyBrokerFailure,
  classifyBrokerNetworkFailure,
} from "./t3team-nexiBrokerErrors";

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
  accessToken: (options?: { readonly fresh?: boolean }) => Promise<string>;
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
  const request = async (path: string, method = "GET", fresh = false) => {
    await checkEnabled();
    let token: string;
    try {
      token = await deps.accessToken(fresh ? { fresh } : undefined);
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
    let response: Response;
    try {
      response = await deps.fetch(`${deps.brokerUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw classifyBrokerNetworkFailure(error);
    }
    if (!response.ok) {
      const text = await brokerErrorText(response);
      throw classifyBrokerFailure(response.status, text, path.startsWith("/v1/sessions/"));
    }
    return response.json();
  };
  const attach = async (sessionId: string) => {
    await checkEnabled();
    if (!/^[\w-]{1,128}$/.test(sessionId)) throw new Error("Invalid broker session.");
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
      // The host verifies this token itself and refuses one issued more than ten minutes ago, so a
      // cached token (valid for hours) would pair on first sign-in and fail ever after.
      return decodePairing(await request(`/v1/sessions/${sessionId}/pairing`, "POST", true))
        .credential;
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
