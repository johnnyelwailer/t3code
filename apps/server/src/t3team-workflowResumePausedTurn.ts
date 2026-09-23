/**
 * Restore a PAUSED run's parked ask — the one sequence behind the card's Resume button
 * (`t3team-workflowRunControl.ts`) and the agent's `t3team.orchestration.resume`
 * (`t3team-toolBrokerWorkflowResumeActions.ts`), so the two cannot drift (GHE #404).
 *
 * Pause removes the pending ask but leaves the child turn running; by the time Resume is clicked
 * that turn has usually finished, and nothing will ever settle a merely re-registered ask. So a
 * `thread.turn` ask is re-registered with its journaled re-drive budget and `redriveArmed`, then
 * handed to the re-drive, which consumes an already-produced answer or re-issues the prompt.
 */
import * as Effect from "effect/Effect";

import type { WorkflowRun } from "./persistence/Services/WorkflowRuns.ts";
import type { WorkflowSignalStoreShape } from "./persistence/Services/WorkflowSignalStore.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";
import { drainSignalParkInbox, type SignalParkDrainResult } from "./t3team-workflowSignalParkDrain.ts";

export interface ResumePausedTurnDeps {
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly turnRedrive?: InterruptedTurnRetry | undefined;
}

/** Validation shared by both entry points; `null` means the run can be resumed. */
export function pausedResumeBlocker(deps: ResumePausedTurnDeps, run: WorkflowRun): string | null {
  if (run.pendingCorrelationId === null && run.wakeAt === null) {
    return "Paused workflow has no continuation to resume.";
  }
  if (run.pendingCorrelationId !== null && deps.registry.getRun(run.runId) === undefined) {
    return "Workflow controller is not ready. Restart the server and try again.";
  }
  if (run.pendingKind === "thread.turn" && deps.turnRedrive === undefined) {
    return "Workflow turn re-drive is not available.";
  }
  return null;
}

/** The three ways a paused row can continue (GHE #332): a thread-parked ask, a clock deadline,
 * or an event park (`signal.wait`, whose continuation lives in the signal store, not the row's
 * thread/timer columns). `resumePaused`'s SQL already flipped the row to the restored status;
 * this performs the matching follow-through and reports it. `warning` (event parks only) is
 * surfaced for callers to log — this helper stays `R = never` so the resume tool's contract
 * does not change. */
export const restorePausedRunContinuation = Effect.fn("restorePausedRunContinuation")(function* (
  input: {
    readonly registry: T3TeamWorkflowEngineRegistryShape;
    readonly run: WorkflowRun;
    readonly rearmScheduler: () => Promise<void>;
    readonly nowIso: () => string;
    readonly turnRedrive?: InterruptedTurnRetry | undefined;
    readonly signalStore?: WorkflowSignalStoreShape | undefined;
  },
) {
  const { registry, run, rearmScheduler, nowIso, turnRedrive, signalStore } = input;
  if (run.pendingKind !== null && run.pendingThreadId !== null) {
    // Re-register with the re-drive budget and re-drive a `thread.turn` at once, or the
    // restored ask is never settled.
    yield* restorePausedPendingAsk({ registry, turnRedrive }, run);
    return { status: "suspended" as const, warning: undefined };
  }
  if (run.wakeAt !== null) {
    yield* Effect.promise(() => rearmScheduler());
    return { status: "sleeping" as const, warning: undefined };
  }
  if (run.pendingKind === "signal.wait") {
    // Event park: no thread ask, no clock — the delivery port drives the wake. Events that
    // landed while paused bridged to the durable inbox; consume them now (the boot-gap
    // bridge, shared with boot rehydration) instead of leaving them stale.
    let warning: SignalParkDrainResult["warning"] = undefined;
    if (signalStore !== undefined) {
      const drained = yield* drainSignalParkInbox({ signalStore, registry, run, nowIso });
      warning = drained.warning;
    }
    return { status: "watching" as const, ...(warning === undefined ? {} : { warning }) };
  }
  return yield* Effect.fail("Paused workflow has no continuation.");
});

/**
 * Re-register the row's pending ask and, for a `thread.turn`, re-drive it at once. Callers have
 * already flipped the row out of `paused` and released the admission queue.
 */
export const restorePausedPendingAsk = Effect.fn("restorePausedPendingAsk")(function* (
  deps: ResumePausedTurnDeps,
  run: WorkflowRun,
) {
  if (
    run.pendingKind === null ||
    run.pendingKind === "signal.wait" ||
    run.pendingThreadId === null ||
    run.pendingCorrelationId === null
  )
    return;
  deps.registry.setPending(run.pendingThreadId, {
    runId: run.runId,
    correlationId: run.pendingCorrelationId,
    kind: run.pendingKind,
    ...(run.pendingKind === "thread.turn"
      ? { turnRetries: run.turnRetries ?? 0, redriveArmed: true as const }
      : {}),
  });
  if (run.pendingKind === "thread.turn" && deps.turnRedrive !== undefined) {
    yield* deps.turnRedrive.processTurnRetry({
      threadId: run.pendingThreadId,
      correlationId: run.pendingCorrelationId,
    });
  }
});
