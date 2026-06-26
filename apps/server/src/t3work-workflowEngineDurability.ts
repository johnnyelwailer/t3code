/**
 * Durable run-record glue (Epic 25 §Open question 2): bridges the Promise-based launch
 * controller to the Effect-based {@link WorkflowRunRepository}.
 *
 *   • {@link buildRunningWorkflowRunRow} assembles the initial `running` row from a launch.
 *   • {@link makeWorkflowRunLifecycle} adapts the repo into the {@link WorkflowRunLifecycle}
 *     the launch controller calls — `recordRunning` upserts the row, `recordSuspended` mirrors
 *     the broker's pending ask into the `pending_*` columns (and flips status to `suspended`),
 *     and `recordCompleted`/`recordFailed` clear the pending ask with a terminal status.
 *
 * It is a plain function (not an `Effect.gen`) closing over a resolved repo, so its
 * `Effect.runPromise` calls run the repo's `R = never` query effects at the moment the launch
 * controller invokes them — outside any surrounding fiber.
 */

import {
  type ModelSelection,
  type ProjectId,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";
import { hashArgs } from "@t3work/sdk";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type {
  WorkflowRun,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import type { WorkflowRunLifecycle } from "./t3work-workflowEngineLaunch.ts";

export interface BuildRunningRowInput {
  readonly runId: string;
  readonly workflowPath: string;
  readonly args: unknown;
  readonly launchThreadId: string | undefined;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly nowIso: string;
}

/** The initial `running` row recorded when a workflow launches. */
export function buildRunningWorkflowRunRow(input: BuildRunningRowInput): WorkflowRun {
  return {
    runId: input.runId,
    workflowPath: input.workflowPath,
    args: input.args,
    argsHash: hashArgs(input.args),
    launchThreadId: input.launchThreadId ?? null,
    projectId: input.projectId,
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    status: "running",
    pendingThreadId: null,
    pendingCorrelationId: null,
    pendingKind: null,
    wakeAt: null,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
}

/** Format an epoch-millis wake deadline as the ISO instant stored in `wake_at`. */
function isoFromMillis(millis: number): string {
  return DateTime.formatIso(DateTime.makeUnsafe(millis));
}

/** Adapt the Effect repo into the Promise-based lifecycle the launch controller drives.
 * `onSleep` (Epic 27) is a best-effort poke fired after a clock park is recorded, so the
 * scheduler re-arms its soonest-deadline timer for the freshly-slept run. */
export function makeWorkflowRunLifecycle(opts: {
  readonly repo: WorkflowRunRepositoryShape;
  readonly row: WorkflowRun;
  readonly nowIso: () => string;
  readonly onSleep?: () => void;
}): WorkflowRunLifecycle {
  const { repo, row } = opts;
  return {
    recordRunning: () => Effect.runPromise(repo.upsert(row)),
    recordSuspended: (pending) =>
      Effect.runPromise(
        repo.setPending({
          runId: row.runId,
          pendingThreadId: pending.threadId,
          pendingCorrelationId: pending.correlationId,
          pendingKind: pending.kind,
          updatedAt: opts.nowIso(),
        }),
      ),
    recordSleeping: (sleep) =>
      Effect.runPromise(
        repo.setSleeping({
          runId: row.runId,
          wakeAt: isoFromMillis(sleep.deadline),
          correlationId: sleep.correlationId,
          updatedAt: opts.nowIso(),
        }),
      ).then(() => {
        opts.onSleep?.();
      }),
    recordCompleted: () =>
      Effect.runPromise(
        repo.clearPending({ runId: row.runId, status: "completed", updatedAt: opts.nowIso() }),
      ),
    recordFailed: () =>
      Effect.runPromise(
        repo.clearPending({ runId: row.runId, status: "failed", updatedAt: opts.nowIso() }),
      ),
  };
}
