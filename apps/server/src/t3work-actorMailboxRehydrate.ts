import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { T3workActorMailboxShape } from "./t3work-actorMailbox.ts";
import { collectPendingActorDeliveries } from "./t3work-actorReactionInput.ts";

export const rehydrateActorMailbox = Effect.fn("rehydrateActorMailbox")(function* (input: {
  readonly engine: Pick<OrchestrationEngineShape, "readEvents">;
  readonly mailbox: T3workActorMailboxShape;
  readonly hopCap: number;
  readonly tryDrain: (threadId: string) => Effect.Effect<void>;
}) {
  const replayed: ReadonlyArray<OrchestrationEvent> = yield* Stream.runCollect(
    input.engine.readEvents(0, Number.MAX_SAFE_INTEGER),
  ).pipe(Effect.map((chunk) => Array.from(chunk)));
  const pending = collectPendingActorDeliveries(replayed, input.hopCap);
  for (const { threadId, entry } of pending) {
    yield* input.mailbox.enqueue(threadId, entry);
  }
  for (const threadId of new Set(pending.map(({ threadId }) => threadId))) {
    yield* input.tryDrain(threadId);
  }
});
