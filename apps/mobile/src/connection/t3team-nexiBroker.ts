import {
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";
import { setAssetUrlObserver } from "@t3tools/client-runtime/state/assets";
import * as Effect from "effect/Effect";
import { appAtomRegistry } from "../state/atom-registry";
import { nexiFeatureFlagPreset, resolveNexiConfig } from "../features/connection/t3team-nexiConfig";
import { nexiAccount } from "../features/connection/t3team-nexiAccount";
import { createMobileBrokerClient, mobileBrokerEnabled } from "./t3team-nexiBrokerClient";
import { createBrokerFlagWatcher } from "./t3team-nexiBrokerFlag";
import { nexiNative, closeNexiTunnels } from "./t3team-nexiNative";
import { installLoopbackCookieFetch, registerLoopbackPort } from "./t3team-nexiLoopbackFetch";
import {
  authorizeNativeFetch,
  installNativeFetchAuthorization,
} from "./t3team-nexiNativeFetchAuth";
import { wakeNexiBrokerConnections } from "./t3team-nexiWakeups";

// Native HTTP clients (downloads, uploads, image and media loaders) cannot send the loopback cookie.
installNativeFetchAuthorization((url) => nexiNative().allowRequest(url));
setAssetUrlObserver(authorizeNativeFetch);

const config = resolveNexiConfig();
const flagPreset = nexiFeatureFlagPreset();
let watchingFlags = false;
export const mobileBroker = createMobileBrokerClient({
  brokerUrl: config?.brokerUrl ?? "",
  enabled: async () => {
    // Resolve after the connection runtime has initialized; avoid a platform/runtime import cycle.
    const { environmentServerConfigsAtom } = await import("../state/server");
    const enabled =
      config !== null &&
      mobileBrokerEnabled(appAtomRegistry.get(environmentServerConfigsAtom).values(), flagPreset);
    if (!watchingFlags) {
      watchingFlags = true;
      const observe = createBrokerFlagWatcher(enabled, {
        closeTunnels: closeNexiTunnels,
        wake: wakeNexiBrokerConnections,
      });
      appAtomRegistry.subscribe(environmentServerConfigsAtom, (configs) => {
        observe(config !== null && mobileBrokerEnabled(configs.values(), flagPreset));
      });
    }
    return enabled;
  },
  accessToken: async (options) => {
    if (!nexiAccount) throw new Error("Nexplore account is not configured.");
    return nexiAccount.accessToken(options);
  },
  start: async (session, stream) => {
    const port = await nexiNative().start(session, stream);
    registerLoopbackPort(port);
    installLoopbackCookieFetch();
    return port;
  },
  fetch: (...args) => fetch(...args),
});

function attempt<A>(run: () => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (error) =>
      error instanceof ConnectionBlockedError || error instanceof ConnectionTransientError
        ? error
        : new ConnectionTransientError({
            reason: "network",
            detail: error instanceof Error ? error.message : "Broker connection failed.",
          }),
  });
}
export const mobileBrokerGateway = {
  attach: (input: { sessionId: string }) => attempt(() => mobileBroker.attach(input.sessionId)),
  pair: (input: { sessionId: string }) => attempt(() => mobileBroker.pair(input.sessionId)),
};
