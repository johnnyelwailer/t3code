import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { T3TeamActorMailboxShape } from "./t3team-actorMailbox.ts";
import { collectStaleSessionThreadIdsAtRehydrate } from "./t3team-actorRestartHold.ts";
import { collectPendingActorDeliveries } from "./t3team-actorReactionInput.ts";
import { collectSuppressedThreadsAtRehydrate } from "./t3team-actorMessageSuppression.ts";

/**
 * Rehydrate the actor mailbox after a restart — and HOLD, not drain (GHE
 * #155). Pending inter-agent deliveries are re-enqueued and the affected
 * threads start suppressed, so a restart produces ZERO auto reaction turns:
 * the old behavior drained every pending delivery immediately (one reaction
 * turn per held message, plus one more per crash-interrupted child as the
 * GHE #157 abnormal-stop notifications arrived live after rehydrate — the
 * restart flood).
 *
 * Held work is surfaced on PULL instead: when the user continues a held
 * thread, the actor reactor (t3team-actorMessageReactor.ts) settles that
 * turn into ONE restart-hold summary turn (t3team-actorRestartHold.ts) that
 * lists the interrupted children and one line per held message, telling the
 * orchestrator to pull detail and resume as it sees fit.
 */
export const rehydrateActorMailbox = Effect.fn("rehydrateActorMailbox")(function* (input: {
  readonly engine: Pick<OrchestrationEngineShape, "readEvents">;
  readonly mailbox: T3TeamActorMailboxShape;
  readonly hopCap: number;
}) {
  const replayed: ReadonlyArray<OrchestrationEvent> = yield* Stream.runCollect(
    input.engine.readEvents(0, Number.MAX_SAFE_INTEGER),
  ).pipe(Effect.map((chunk) => Array.from(chunk)));
  // Restore suppression BEFORE enqueueing below — a fresh process has
  // forgotten the in-memory flag entirely, and draining first would resume
  // the exact ping-pong the suppression exists to stop.
  for (const threadId of collectSuppressedThreadsAtRehydrate(replayed)) {
    yield* input.mailbox.suppress(threadId);
  }
  const pending = collectPendingActorDeliveries(replayed, input.hopCap);
  for (const { threadId, entry } of pending) {
    yield* input.mailbox.enqueue(threadId, entry);
  }
  // Restart hold: threads with held pending deliveries, plus the stale
  // session set (still running/starting when the process died — the set the
  // startup reconcile stops, whose #157 abnormal-stop notifications arrive
  // live AFTER rehydrate and would otherwise auto-drain), start suppressed.
  // No auto-drain: the held work stays queued and is surfaced as ONE summary
  // turn when the user continues the thread. The held set is returned so the
  // reactor can scope the continue-summary to RESTART-held threads only — a
  // user-stop suppression on any other thread keeps its current semantics.
  const held = new Set<string>(pending.map(({ threadId }) => threadId));
  for (const threadId of collectStaleSessionThreadIdsAtRehydrate(replayed)) {
    held.add(threadId);
  }
  for (const threadId of held) {
    yield* input.mailbox.suppress(threadId);
  }
  return held;
});
