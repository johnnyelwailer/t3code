import type { Wakeups } from "@t3tools/client-runtime/connection";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

type NexiWakeReason = Extract<
  Wakeups.ConnectionWakeup,
  "credentials-changed" | "broker-availability-changed"
>;

/**
 * Wakeups for the Nexi broker. `subscribeAccount` reports Nexplore sign-in and sign-out, which keep the
 * `credentials-changed` reason. Broker availability uses its own reason because `credentials-changed`
 * ends healthy T3 Connect relay leases.
 */
export function createNexiWakeups(subscribeAccount: (listener: () => void) => () => void) {
  const brokerListeners = new Set<() => void>();
  return {
    wakeBroker: () => {
      for (const listener of brokerListeners) listener();
    },
    changes: Stream.callback<NexiWakeReason>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const offerAccount = () => Queue.offerUnsafe(queue, "credentials-changed");
          const offerBroker = () => Queue.offerUnsafe(queue, "broker-availability-changed");
          brokerListeners.add(offerBroker);
          const unsubscribe = subscribeAccount(offerAccount);
          return () => {
            brokerListeners.delete(offerBroker);
            unsubscribe();
          };
        }),
        (unsubscribe) => Effect.sync(unsubscribe),
      ).pipe(Effect.asVoid),
    ),
  };
}
