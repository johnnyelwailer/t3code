/**
 * Fork "stop including sub-runs": interrupt a thread's active run and every
 * descendant subagent thread's active run (V2 lineage). WS method
 * `t3team.stopThreadCascade`, orchestration:operate scope, capability-gated by
 * `capabilities.t3team.stopCascade`.
 *
 * `commandId` is the client-minted idempotency key: every interrupt the
 * cascade dispatches derives its own command id from it, so a retried request
 * dispatches nothing twice while a later stop (a new key) still reaches a
 * child an earlier one missed.
 */
import * as Schema from "effect/Schema";

import { CommandId, NonNegativeInt, ThreadId } from "./baseSchemas.ts";

export const T3TeamStopThreadCascadeInput = Schema.Struct({
  threadId: ThreadId,
  commandId: CommandId,
});
export type T3TeamStopThreadCascadeInput = typeof T3TeamStopThreadCascadeInput.Type;

export const T3TeamStopThreadCascadeOutcome = Schema.Literals([
  "interrupt_requested",
  "no_active_run",
  "failed",
]);
export type T3TeamStopThreadCascadeOutcome = typeof T3TeamStopThreadCascadeOutcome.Type;

export const T3TeamStopThreadCascadeResult = Schema.Struct({
  /** What happened to the thread the user stopped. */
  root: T3TeamStopThreadCascadeOutcome,
  /** Descendant subagent threads found below it, and how their interrupts went. */
  descendants: Schema.Struct({
    found: NonNegativeInt,
    interrupted: NonNegativeInt,
    failed: NonNegativeInt,
  }),
});
export type T3TeamStopThreadCascadeResult = typeof T3TeamStopThreadCascadeResult.Type;
