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
  type OrchestrationCommand,
  type ProjectId,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";
import { hashArgs } from "@t3team/sdk";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type {
  WorkflowRun,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import type { WorkflowRunLifecycle } from "./t3team-workflowEngineLaunch.ts";
import { deliverWorkflowFailure } from "./t3team-workflowCompletionMessage.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";

export interface BuildRunningRowInput {
  readonly runId: string;
  readonly workflowPath: string;
  readonly args: unknown;
  readonly launchThreadId: string | undefined;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  /** Launch origin; defaults to `recipe` (the ephemeral tool path passes `ephemeral`). */
  readonly origin?: WorkflowRun["origin"];
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
    origin: input.origin ?? "recipe",
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
  /** Present when the caller can post to the launching thread: orphaned runs
   * (crash-recovered clock parks) then notify the conversation instead of
   * failing silently with only a server log line. */
  readonly dispatch?: (command: OrchestrationCommand) => Promise<void>;
  readonly newId?: () => string;
}): WorkflowRunLifecycle {
  const { repo, row } = opts;
  const admissionManaged = row.origin === "ephemeral";
  const releaseAdmission = (): void => {
    if (admissionManaged) workflowAdmissionQueue.release(row.runId);
  };
  return {
    recordRunning: () => Effect.runPromise(repo.upsert(row)),
    recordActive: async () => {
      if (
        workflowAdmissionQueue.isCancelled(row.runId) ||
        workflowAdmissionQueue.isPaused(row.runId)
      )
        return false;
      if (admissionManaged) {
        await Effect.runPromise(
          repo.setStatus({ runId: row.runId, status: "queued", updatedAt: opts.nowIso() }),
        );
        const queued = await Effect.runPromise(repo.getById({ runId: row.runId }));
        if (
          Option.isNone(queued) ||
          queued.value.status === "cancelled" ||
          queued.value.status === "paused"
        )
          return false;
        if (!(await workflowAdmissionQueue.acquire(row.runId))) return false;
        if (
          workflowAdmissionQueue.isCancelled(row.runId) ||
          workflowAdmissionQueue.isPaused(row.runId)
        )
          return false;
      }
      await Effect.runPromise(
        repo.setStatus({ runId: row.runId, status: "running", updatedAt: opts.nowIso() }),
      );
      const activeRow = await Effect.runPromise(repo.getById({ runId: row.runId }));
      return Option.isSome(activeRow) && activeRow.value.status === "running";
    },
    releaseActive: releaseAdmission,
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
        releaseAdmission();
        opts.onSleep?.();
      }),
    recordCompleted: () =>
      Effect.runPromise(
        repo.clearPending({ runId: row.runId, status: "completed", updatedAt: opts.nowIso() }),
      ).then(releaseAdmission),
    recordFailed: () =>
      Effect.runPromise(
        repo.clearPending({ runId: row.runId, status: "failed", updatedAt: opts.nowIso() }),
      ).then(releaseAdmission),
    // Crash-recovery guard: the scheduler resumed a clock park whose `waitUntil` reply was already
    // journaled by a PRIOR process that died before settling (appendResolvedEntry → wrote:false).
    // The run row is stuck `sleeping`, so listSleeping re-arms it forever. Mark it failed — but
    // ONLY when the row is still sleeping on THIS correlation, so a late/duplicate ask reply on an
    // already-woken run (now sleeping on a different waitUntil) is never spuriously failed.
    orphanIfSleeping: (correlationId) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const current = yield* repo.getById({ runId: row.runId });
          if (
            Option.isNone(current) ||
            (current.value.status !== "sleeping" && current.value.status !== "running") ||
            current.value.pendingCorrelationId !== correlationId
          )
            return;
          yield* repo.clearPending({
            runId: row.runId,
            status: "failed",
            updatedAt: opts.nowIso(),
          });
          releaseAdmission();
          yield* Effect.logWarning(
            "workflow scheduler orphaned a sleeping run whose wake reply was resolved before settle",
            { runId: row.runId, correlationId },
          );
          if (opts.dispatch !== undefined && opts.newId !== undefined) {
            yield* Effect.promise(() =>
              deliverWorkflowFailure({
                launchThreadId: row.launchThreadId ?? undefined,
                workflowRunId: row.runId,
                errorText:
                  "A crash interrupted this run's scheduled wake-up; it could not be resumed.",
                dispatch: opts.dispatch!,
                newId: opts.newId!,
                nowIso: opts.nowIso,
              }),
            );
          }
        }),
      ),
  };
}
