/**
 * `drain` op for the `t3team.thread.children` meta tool: claim the CALLER's
 * own inter-agent mailbox NOW instead of waiting for the boundary drain.
 *
 * No target thread argument — a thread drains its OWN inbox, matching the
 * mailbox's per-thread scope. The op is validation + formatting; the claim and
 * dispatch live in the mailbox layer's port (one drain path, not two).
 *
 * Result states: `dispatched` (idle: the digest turn just started), `queued`
 * (mid-turn: delivered when the turn ends), `held` (suppressed after a user
 * stop: stays in the timeline until the user re-engages).
 *
 * @module t3team-toolBrokerChildrenDrain
 */
import * as Effect from "effect/Effect";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import type { ChildrenArgs, T3TeamChildrenToolDeps } from "./t3team-toolBrokerChildrenTypes.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";

export function opDrain(
  deps: T3TeamChildrenToolDeps,
  args: ChildrenArgs,
): Effect.Effect<T3TeamToolCallResult, never> {
  const extra = Object.keys(args).find((key) => key !== "op");
  if (extra !== undefined) {
    return Effect.succeed(
      errorResult(
        `invalid argument for drain: ${extra} — the drain op takes no arguments; ` +
          "it always drains the calling thread's own inter-agent mailbox",
      ),
    );
  }
  const drain = deps.drainOwnMailbox;
  if (drain === undefined) {
    return Effect.succeed(errorResult("The inter-agent mailbox is not available in this runtime."));
  }
  return drain().pipe(
    Effect.map((outcome) => okResult({ ok: true, threadId: deps.callerThreadId, ...outcome })),
    Effect.catch((error) => Effect.succeed(errorResult(`Drain failed: ${String(error)}`))),
  );
}
