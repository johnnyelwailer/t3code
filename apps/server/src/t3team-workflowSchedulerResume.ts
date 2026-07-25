/**
 * The scheduler's resume-path helpers (Epic 27), split out of `t3team-workflowScheduler.ts` to
 * keep each module focused and under the prefixed-file LOC cap.
 *
 * Both are the loop-safety half of the scheduler: when a due `sleeping` row cannot actually be
 * driven forward — its run was never rehydrated this uptime, or its wake reply was already
 * journaled by a process that crashed before settling — the row must be taken OUT of the sleeping
 * set, not resumed as a no-op that leaves it eligible to re-arm forever.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { WorkflowRunRepositoryShape } from "./persistence/Services/WorkflowRuns.ts";

/** Mark a stuck `sleeping` run failed (orphaned) so `listSleeping` no longer returns it — the
 * scheduler stops re-arming it. Used when a due row has no registered resume closure this uptime
 * (never rehydrated: recipe gone, or rehydration failed). No-op if the row already left sleeping,
 * OR if it's sleeping on a *different* correlation than the due timer's — mirrors the pin
 * `orphanIfSleeping` (t3team-workflowEngineDurability.ts) uses, so a late/duplicate due-timer fire
 * on an already-woken run (now sleeping on a fresh waitUntil) never spuriously fails it. */
export function orphanSleepingRun(
  repo: WorkflowRunRepositoryShape,
  runId: string,
  correlationId: string,
  /** Present when the scheduler can post to the launching thread — the orphaned
   * run then notifies the conversation instead of failing with only a log line. */
  deliverFailure?: (launchThreadId: string | undefined, errorText: string) => Promise<void>,
): Promise<void> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const current = yield* repo.getById({ runId });
      if (
        Option.isNone(current) ||
        current.value.status !== "sleeping" ||
        current.value.pendingCorrelationId !== correlationId
      )
        return;
      yield* repo.clearPending({
        runId,
        status: "failed",
        updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
      });
      yield* Effect.logWarning(
        "workflow scheduler orphaned a sleeping run with no registered resume closure",
        { runId, correlationId },
      );
      if (deliverFailure !== undefined) {
        yield* Effect.promise(() =>
          deliverFailure(
            current.value.launchThreadId ?? undefined,
            "This run's scheduled wake-up fired, but the run could not be restored (its source or state was gone).",
          ),
        );
      }
    }),
  );
}

/** The scheduler's resume path (shared by the live host and its tests): drive a registered run's
 * resume, or — when the due row has no registered closure this uptime — orphan it instead of
 * letting it re-arm forever. */
export function makeSchedulerResume(deps: {
  readonly getRun: (
    runId: string,
  ) => { readonly resume: (correlationId: string, reply: unknown) => Promise<void> } | undefined;
  readonly orphan: (runId: string, correlationId: string) => Promise<void>;
}): (runId: string, correlationId: string) => Promise<void> {
  return (runId, correlationId) => {
    const run = deps.getRun(runId);
    if (run === undefined) return deps.orphan(runId, correlationId);
    return run.resume(correlationId, {});
  };
}
