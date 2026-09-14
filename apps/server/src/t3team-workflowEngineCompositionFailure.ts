/**
 * Presentation + step-activity wiring for a `parallel()`/`pipeline()` branch that rejected (see
 * `@runbook/core/composition`'s `CompositionBranchFailure`). Split out of
 * `t3team-workflowEngineController.ts` to keep that module under its LOC cap — this is pure
 * formatting/dispatch glue, no run-lifecycle state of its own (the controller still owns the
 * per-run `compositionBranchFailures` list and decides when to summarize it).
 */

import type { WorkflowRunOptions } from "@t3team/sdk";

import type { WorkflowStepActivityEmitter } from "./t3team-workflowEngineStepActivities.ts";

/** The `failure` argument `WorkflowRunOptions.onCompositionBranchFailed` is called with. */
export type WorkflowCompositionBranchFailure = Parameters<
  NonNullable<WorkflowRunOptions["onCompositionBranchFailed"]>
>[0];

/**
 * Human label for a swallowed `parallel()`/`pipeline()` branch failure. There is no author-given
 * name for a bare thunk (unlike an `agent()` call's `label`), so this identifies the branch by
 * its structural position instead of inventing one — see `CompositionBranchFailure`'s own doc in
 * `@runbook/core/composition` for why `stageIndex` only exists for `pipeline`.
 */
export function describeCompositionBranchLabel(failure: WorkflowCompositionBranchFailure): string {
  if (failure.compositionKind === "parallel") {
    return `Parallel branch ${failure.index + 1} of ${failure.total} failed`;
  }
  const stagePart =
    failure.stageIndex === undefined
      ? ""
      : ` at stage ${failure.stageIndex + 1} of ${failure.stageTotal ?? "?"}`;
  return `Pipeline item ${failure.index + 1} of ${failure.total} failed${stagePart}`;
}

/**
 * One-line summary of every branch failure seen this run, for the run-level terminal activity's
 * `error` field (the run's own `phase` stays "completed" — see the controller's `settle`). The
 * failed branch's OWN step row (from `createCompositionBranchFailureHandler` below) is the
 * primary signal; this is a cheap secondary note so the run-level activity itself does not read
 * as unqualifiedly green. `undefined` when there were none, so a clean run is untouched.
 */
export function summarizeCompositionBranchFailures(
  failures: ReadonlyArray<WorkflowCompositionBranchFailure>,
): string | undefined {
  if (failures.length === 0) return undefined;
  return `Completed with ${failures.length} failed parallel/pipeline branch(es): ${failures
    .map((failure) => describeCompositionBranchLabel(failure))
    .join("; ")}`;
}

/**
 * Builds the `WorkflowRunOptions.onCompositionBranchFailed` handler: records the failure (via
 * `onFailure`, so the controller can summarize it later at `settle`) and emits a one-shot
 * "failed" step activity for it — see `WorkflowStepActivityEmitter.emitSent`'s doc for why a
 * one-shot terminal send needs no matching `emitResolved` (mirrors the broker's own
 * `step(..., "completed")` calls for `model.resolve`/`thread.create`).
 */
export function createCompositionBranchFailureHandler(deps: {
  readonly stepActivities: WorkflowStepActivityEmitter;
  readonly runId: string;
  readonly newId: () => string;
  readonly getWorkflowPhase: () => string | undefined;
  readonly onFailure: (failure: WorkflowCompositionBranchFailure) => void;
}): NonNullable<WorkflowRunOptions["onCompositionBranchFailed"]> {
  return (failure) => {
    deps.onFailure(failure);
    const workflowPhase = deps.getWorkflowPhase();
    return deps.stepActivities.emitSent({
      correlationId: `${deps.runId}:composition:${deps.newId()}`,
      stepKind: failure.compositionKind === "parallel" ? "parallel.branch" : "pipeline.stage",
      phase: "failed",
      detail: describeCompositionBranchLabel(failure),
      error: failure.error,
      ...(workflowPhase === undefined ? {} : { workflowPhase }),
    });
  };
}
