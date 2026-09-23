/**
 * Wake bridge for a run parked on an event (GHE #332): drain the durable signal inbox the run's
 * awaited tuple has an open entry in, and resume the run with that payload.
 *
 * Shared by every path that puts a run BACK into `watching` — boot rehydration (the boot-gap
 * bridge, t3team-workflowEngineRehydrate.ts) and the two explicit-resume entry points (the card's
 * control route and `t3team.orchestration.resume`). An event emitted while the run was NOT
 * parked-reachable (boot down, or `paused`) bridges to the durable inbox; when the run becomes
 * reachable again, its own bridged event is consumed here so it is not left stale for the run's
 * next, unrelated park on the same tuple.
 *
 * Best-effort by design: a journal or resume failure must not abort the caller — the inbox
 * entry is consumed either way, so a lost wake is surfaced via `warning` rather than silently
 * dropped: the run stays `watching` and the next live event for the tuple re-delivers it.
 * Callers log the warning where their effect environment allows it (boot rehydration and the
 * control route do; the resume tool's `R = never` contract does not — it still returns success).
 *
 * No service requirements on purpose: the entry points' `R = never` effect contracts must stay
 * intact, so this helper carries no Logger and returns the warning for the caller to log.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import type { WorkflowRun } from "./persistence/Services/WorkflowRuns.ts";
import type { WorkflowSignalStoreShape } from "./persistence/Services/WorkflowSignalStore.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";

export interface SignalParkDrainResult {
  /** 1 when the run was woken by a bridged event, 0 otherwise (no open entry / no controller). */
  readonly drained: 0 | 1;
  /** Set when the take or the resume failed (best-effort: the caller still lands the run). */
  readonly warning?:
    | { readonly message: string; readonly details: Readonly<Record<string, unknown>> }
    | undefined;
}

/** Take the open inbox entry for the run's parked `(signal, key)` and resume the run with it. */
export const drainSignalParkInbox = Effect.fn("drainSignalParkInbox")(function* (input: {
  readonly signalStore: WorkflowSignalStoreShape;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly run: WorkflowRun;
  readonly nowIso: () => string;
}) {
  const { signalStore, registry, run, nowIso } = input;
  if (
    run.pendingCorrelationId == null ||
    run.watchSourceName == null ||
    run.watchParamsHash == null ||
    run.watchSignalName == null ||
    run.watchSignalKey == null
  ) {
    // Incomplete park (corrupt row): leave it to the next live event rather than pointing a
    // half-tuple at the inbox.
    return { drained: 0 } as const;
  }
  const take = yield* signalStore
    .takeOpenInboxEntry({
      sourceName: run.watchSourceName,
      paramsHash: run.watchParamsHash,
      signalName: run.watchSignalName,
      key: run.watchSignalKey,
      deliveredAt: nowIso(),
    })
    .pipe(Effect.result);
  if (!Result.isSuccess(take)) {
    return {
      drained: 0,
      warning: {
        message: "signal-park inbox drain: take failed; the run stays parked for the next event",
        details: { runId: run.runId, error: String(take.failure) },
      },
    };
  }
  const pending = take.success;
  if (Option.isNone(pending)) return { drained: 0 } as const;
  const controller = registry.getRun(run.runId);
  if (controller === undefined) return { drained: 0 } as const;
  const resumed = yield* Effect.promise(() =>
    controller.resume(run.pendingCorrelationId!, pending.value.payload),
  ).pipe(Effect.result);
  if (!Result.isSuccess(resumed)) {
    return {
      drained: 1,
      warning: {
        message: "signal-park inbox drain: resume failed; the next event re-delivers the wake",
        details: { runId: run.runId, error: String(resumed.failure) },
      },
    };
  }
  return { drained: 1 } as const;
});
