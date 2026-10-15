/**
 * Auto-resume of a run that failed TRANSIENTLY (gateway timeout, "request queue is full", 5xx):
 * the host's transient-turn retry arms `thread.transientRecovery` for the failed run, a scheduler
 * sweep continues it at `nextTryAt` while `autoResume` holds, and the composer banner shows the
 * countdown with a toggle. Mirrors `OrchestrationV2LimitRecovery` (usage limits).
 *
 * @module t3team-transientRecovery
 */
import * as Schema from "effect/Schema";

import { IsoDateTime, RunId } from "./baseSchemas.ts";

/**
 * The provider failure class a transient gateway failure carries on the failed run's root
 * `error` item. Clients gate the failed-state banner on it; providers (Nexplore, Codex, Claude)
 * map timeouts and capacity rejections to it.
 */
export const TRANSIENT_RECOVERY_FAILURE_CLASS = "transport_error" as const;

export const OrchestrationV2TransientRecovery = Schema.Struct({
  runId: RunId,
  /** When the host continues the run; null when the user turned auto-resume off before arming. */
  nextTryAt: Schema.NullOr(IsoDateTime),
  autoResume: Schema.Boolean,
});
export type OrchestrationV2TransientRecovery = typeof OrchestrationV2TransientRecovery.Type;

/** An update keeps omitted fields of the same run's recovery (a new run starts from defaults). */
export const OrchestrationV2TransientRecoveryUpdate = Schema.Struct({
  runId: RunId,
  nextTryAt: Schema.optional(Schema.NullOr(IsoDateTime)),
  autoResume: Schema.optional(Schema.Boolean),
});
export type OrchestrationV2TransientRecoveryUpdate =
  typeof OrchestrationV2TransientRecoveryUpdate.Type;

/** Folds an update into the thread's current recovery. Auto-resume defaults ON for a new run. */
export function mergeTransientRecovery(
  current: OrchestrationV2TransientRecovery | null | undefined,
  update: OrchestrationV2TransientRecoveryUpdate,
): OrchestrationV2TransientRecovery {
  const previous = current?.runId === update.runId ? current : null;
  return {
    runId: update.runId,
    nextTryAt: update.nextTryAt === undefined ? (previous?.nextTryAt ?? null) : update.nextTryAt,
    autoResume: update.autoResume ?? previous?.autoResume ?? true,
  };
}
