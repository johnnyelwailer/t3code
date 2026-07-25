/**
 * The `waitUntil` body primitive (Epic 27 §waitUntil) — the clock-driven sibling of `wait`.
 *
 * A durable suspension fired through the broker exactly like an ask verb: a `sent` entry
 * carrying the deadline parks the run (→ `WorkflowSuspended` → `SuspendedResult`); its
 * `resolved` reply is appended later — by the scheduler when the wall clock reaches the
 * deadline, NOT by an event. The deadline rides in the `sent` entry's args, so the argsHash
 * drift guard enforces that `when` re-derives identically on replay (it must come from the
 * journaled `now()`, never the live clock). The host's broker records the deadline as the run's
 * `wake_at` so the scheduler can arm a timer; on resume the recorded reply settles the await.
 *
 * Split out of the Thread-model primitives because it is not a thread verb (no thread, no
 * recipient) — it is a scheduling primitive, and keeping it here holds the dense thread module
 * under the additive-guard LOC ceiling.
 */

import type { MessageBroker } from "./t3team-sdk.broker.ts";
import { PermissionDeniedError } from "./t3team-sdk.errors.ts";
import type { HandleDispatch, ReplyResolver } from "./t3team-sdk.handles.ts";

/** The schedule globals this module binds into the workflow body. */
export interface SchedulePrimitives {
  /** Suspend until a wall-clock instant (epoch millis), then resume from the journal. Gated by
   * the `"schedule"` capability; calling it without that capability throws
   * {@link PermissionDeniedError}. */
  readonly waitUntil: (when: number) => Promise<void>;
}

export function createSchedulePrimitives(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
}): SchedulePrimitives {
  const { dispatch, broker } = deps;

  const waitUntilImpl = async (when: number): Promise<void> => {
    const payload = { deadline: when };
    const correlationId = await dispatch.send({
      kind: "wait.until",
      refId: "wait.until",
      args: payload,
      fire: (cid: string, resolver: ReplyResolver) =>
        broker.send({ correlationId: cid, kind: "wait.until", payload }, resolver),
    });
    // The scheduler's reply is an empty settle — there is no value to read, only the wake.
    await dispatch.awaitResolution<unknown>(correlationId, undefined);
  };

  const waitUntil: SchedulePrimitives["waitUntil"] = deps.capabilities.has("schedule")
    ? waitUntilImpl
    : () => {
        throw new PermissionDeniedError(
          "'waitUntil' requires the 'schedule' capability. Add 'schedule' to this workflow's meta.capabilities.",
        );
      };

  return { waitUntil };
}
