import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { subscribeNexiAccountChanges } from "../features/connection/t3team-nexiAccount";

const brokerEnabledListeners = new Set<() => void>();
/** Wakes parked broker connections; a wake never restarts a healthy connection. */
export const wakeNexiBrokerConnections = () => {
  for (const listener of brokerEnabledListeners) listener();
};

export const nexiAccountChanges = Stream.callback<"credentials-changed">((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const offer = () => Queue.offerUnsafe(queue, "credentials-changed");
      brokerEnabledListeners.add(offer);
      const unsubscribe = subscribeNexiAccountChanges(offer);
      return () => {
        brokerEnabledListeners.delete(offer);
        unsubscribe();
      };
    }),
    (unsubscribe) => Effect.sync(unsubscribe),
  ).pipe(Effect.asVoid),
);
