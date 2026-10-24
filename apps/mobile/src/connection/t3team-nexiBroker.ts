import {
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";
import * as Effect from "effect/Effect";
import { appAtomRegistry } from "../state/atom-registry";
import { resolveNexiConfig } from "../features/connection/t3team-nexiConfig";
import { nexiAccount } from "../features/connection/t3team-nexiAccount";
import { createMobileBrokerClient, mobileBrokerEnabled } from "./t3team-nexiBrokerClient";
import { nexiNative, closeNexiTunnels } from "./t3team-nexiNative";

const config = resolveNexiConfig();
let watchingFlags = false;
export const mobileBroker = createMobileBrokerClient({
  brokerUrl: config?.brokerUrl ?? "",
  enabled: async () => {
    // Resolve after the connection runtime has initialized; avoid a platform/runtime import cycle.
    const { environmentServerConfigsAtom } = await import("../state/server");
    if (!watchingFlags) {
      watchingFlags = true;
      appAtomRegistry.subscribe(environmentServerConfigsAtom, (configs) => {
        if (!mobileBrokerEnabled(configs.values())) closeNexiTunnels();
      });
    }
    return (
      config !== null &&
      mobileBrokerEnabled(appAtomRegistry.get(environmentServerConfigsAtom).values())
    );
  },
  accessToken: async () => {
    if (!nexiAccount) throw new Error("Nexplore account is not configured.");
    return nexiAccount.accessToken();
  },
  start: (session, stream) => nexiNative().start(session, stream),
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
