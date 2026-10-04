/**
 * Bounded retry for `thread.turn.start` when decider admission rejects it because the thread
 * already has a turn in progress (a race between two automated triggers at SEND time — actor
 * delivery, a workflow step, a child kickoff — see `t3team-deciderTurnAdmission.ts`). Without
 * this, `t3team-workflowEngineBrokerAsk.ts` awaits the ask and a transient collision fails the
 * WHOLE run instead of retrying past it (live incident: a race killed a 24/7 heartbeat run).
 *
 * Reuses the interrupted-turn re-drive's budget/backoff ladder
 * (`t3team-workflowEngineTurnRetrySupport.ts`) — same shape, different trigger: that module
 * re-drives a turn AFTER it started and then died; this retries BEFORE it starts at all. Only
 * once the budget is spent does the rejection propagate, so the run fails instead of parking
 * forever on a turn that never began.
 *
 * @module t3team-workflowEngineTurnStartBusyRetry
 */
import { isThreadBusyErrorMessage } from "@t3tools/shared/t3team-threadBusyInvariant";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import {
  interruptedTurnRetryBackoffMs,
  MAX_INTERRUPTED_TURN_REDRIVES,
} from "./t3team-workflowEngineTurnRetrySupport.ts";

/** True for a decider rejection of `thread.turn.start` because the thread is already busy — the
 * ONE `OrchestrationCommandInvariantError` shape this retry treats as transient. Any other
 * rejection (an invalid command, a different invariant) is permanent and must propagate. */
export function isThreadTurnStartBusyRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const tagged = error as { _tag?: unknown; detail?: unknown };
  return (
    tagged._tag === "OrchestrationCommandInvariantError" &&
    typeof tagged.detail === "string" &&
    isThreadBusyErrorMessage(tagged.detail)
  );
}

const defaultDelay = (ms: number): Promise<void> =>
  Effect.runPromise(Effect.sleep(Duration.millis(ms)));

/**
 * Run `send` (the enqueued `thread.turn.start` dispatch), retrying a busy-thread rejection with
 * backoff up to {@link MAX_INTERRUPTED_TURN_REDRIVES} attempts. `enqueue` is the broker's serial
 * lane — each retry re-enqueues, so it still lands after anything already queued ahead of it.
 */
export async function dispatchThreadTurnStartWithRetry(
  enqueue: (fn: () => Promise<void>) => Promise<void>,
  send: () => Promise<void>,
  delay: (ms: number) => Promise<void> = defaultDelay,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await enqueue(send);
      return;
    } catch (error) {
      if (!isThreadTurnStartBusyRejection(error) || attempt >= MAX_INTERRUPTED_TURN_REDRIVES) {
        throw error;
      }
      await delay(interruptedTurnRetryBackoffMs(attempt));
    }
  }
}
