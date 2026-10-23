import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { subscribeNexiAccountChanges } from "../features/connection/t3team-nexiAccount";

export const nexiAccountChanges = Stream.callback<"credentials-changed">((queue) =>
  Effect.acquireRelease(
    Effect.sync(() =>
      subscribeNexiAccountChanges(() => Queue.offerUnsafe(queue, "credentials-changed")),
    ),
    (unsubscribe) => Effect.sync(unsubscribe),
  ).pipe(Effect.asVoid),
);
