/**
 * `drain` op for the `t3team.thread.children` meta tool: claim the CALLER's
 * own inter-agent mailbox NOW instead of waiting for the boundary drain
 * (inter-agent messaging overhaul).
 *
 * Design: NO target thread argument — a thread drains its OWN inbox, matching
 * the mailbox's per-thread scope and avoiding a cross-thread surface. The op
 * is pure validation + formatting; the actual claim/dispatch happens in the
 * live layer's `drainOwnMailbox` dep, which reuses the SAME primitives the
 * reactor uses (shared mailbox service, startActorReaction) so there is one
 * drain path, not a second one.
 *
 * Result states:
 *   - `dispatched`: the thread was idle — a digest turn just started;
 *   - `queued`: the thread is mid-turn — the messages stay queued and the
 *     ordinary boundary drain delivers them when the turn settles;
 *   - `held`: auto-dispatch is suppressed for the thread (the user stopped
 *     its turn) — the messages stay visible in the timeline, no digest until
 *     the user re-engages.
 *
 * @module t3team-toolBrokerChildrenDrain
 */
import * as Effect from "effect/Effect";

import { okResult, errorResult } from "./t3team-toolBrokerHelpers.ts";
import type { ChildrenArgs, T3TeamChildrenToolDeps } from "./t3team-toolBrokerChildrenTypes.ts";
import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";

export function opDrain(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult, never> {
  const threadId = deps.callerThreadId;
  // drain takes no arguments: any provided field is a caller mistake.
  for (const key of Object.keys(args)) {
    if (key === "op") continue;
    return Effect.succeed(
      errorResult(
        `invalid argument for drain: ${String(key)} — the drain op takes no arguments; ` +
          "it always drains the calling thread's own inter-agent mailbox",
      ),
    );
  }
  return deps.drainOwnMailbox().pipe(
    Effect.map((outcome) => okResult({ ok: true, threadId, ...outcome })),
    Effect.catch((error) => Effect.succeed(errorResult(`Drain failed: ${String(error)}`))),
  );
}
