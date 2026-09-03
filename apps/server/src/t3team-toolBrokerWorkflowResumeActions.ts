/**
 * The `t3team.orchestration.resume` action implementations, split from
 * {@link ./t3team-toolBrokerWorkflowResumeTool.ts} for the additive size budget:
 * optional corrected-source replacement (ephemeral runs only), the paused-run continuation
 * restore (mirrors the HTTP control route). The failed-run journal re-drive lives in
 * ./t3team-toolBrokerWorkflowResumeFailed.ts (additive size budget).
 */
import type { OrchestrationCommand, ThreadId } from "@t3tools/contracts";
import { workflowSourceVersion, type JournalStore, type WorkflowRef } from "@t3team/sdk";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type {
  WorkflowRun,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import type {
  ResumeWorkflowHandlerArgs,
  WorkflowResumeToolValue,
} from "./t3team-toolBrokerWorkflowResumeTool.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";
import { replaceEphemeralWorkflowSourceAtomically } from "./t3team-workflowEphemeralSource.ts";
import { pausedResumeBlocker, restorePausedPendingAsk } from "./t3team-workflowResumePausedTurn.ts";
import { precheckWorkflowSource } from "./t3team-workflowSourcePrecheck.ts";

export interface WorkflowResumeToolDeps<E = string> {
  readonly fileSystem?: FileSystem.FileSystem | undefined;
  readonly path?: Path.Path | undefined;
  readonly runRepository: WorkflowRunRepositoryShape;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly journalStore: JournalStore;
  readonly rearmScheduler: () => Promise<void>;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly loadThreadProject: (
    threadId: ThreadId,
  ) => Effect.Effect<
    { readonly project: { readonly workspaceRoot: string | null | undefined } },
    E
  >;
  /** Re-issues a failed run's retained `thread.turn` step (GHE #403). Absent when the broker's
   * environment has no thread query / engine dispatch; the failed-step resume then reports so. */
  readonly turnRedrive?: InterruptedTurnRetry | undefined;
}

export const nowIso = (): string => DateTime.formatIso(DateTime.nowUnsafe());
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const workspaceRootFor = <E>(deps: WorkflowResumeToolDeps<E>, threadId: ThreadId) =>
  Effect.gen(function* () {
    const { project } = yield* deps.loadThreadProject(threadId).pipe(Effect.mapError(errorMessage));
    if (typeof project.workspaceRoot !== "string" || project.workspaceRoot.length === 0) {
      return yield* Effect.fail("Current t3team project has no workspace root.");
    }
    return deps.path!.resolve(project.workspaceRoot);
  });

/** Swap in corrected source before resuming — ephemeral runs only (their source lives under
 * `.t3team-runs/<runId>/workflow.ts`, re-read on every resume). */
export const replaceRunSourceIfRequested = <E>(
  deps: WorkflowResumeToolDeps<E>,
  threadId: ThreadId,
  run: WorkflowRun,
  source: ResumeWorkflowHandlerArgs["source"],
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    const trimmed = source?.trim() ?? "";
    if (trimmed.length === 0) return;
    if (!deps.fileSystem || !deps.path) {
      return yield* Effect.fail(
        "Filesystem services are not available for t3team.orchestration.resume in this runtime.",
      );
    }
    const precheckError = precheckWorkflowSource(trimmed);
    if (precheckError !== null) return yield* Effect.fail(precheckError);
    const workspaceRoot = yield* workspaceRootFor(deps, threadId);
    const runsRoot = deps.path.join(workspaceRoot, ".t3team-runs");
    const ephemeralPath = deps.path.join(runsRoot, run.runId, "workflow.ts");
    if (run.workflowPath !== ephemeralPath) {
      return yield* Effect.fail(
        "Corrected source is only supported for ephemeral runs (source under .t3team-runs); " +
          "edit the recipe's .workflow.ts on disk instead.",
      );
    }
    yield* replaceEphemeralWorkflowSourceAtomically({
      runsRoot,
      runId: run.runId,
      source: source ?? trimmed,
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, deps.fileSystem),
      Effect.provideService(Path.Path, deps.path),
      Effect.mapError(errorMessage),
    );
    // A supplied replacement is an explicit source decision. Establish its content hash as the
    // new baseline before a paused run's later reply re-enters the already-registered controller.
    // This keeps that path strict for every subsequent resume without making the controller
    // mutable or weakening ordinary source-change detection.
    const meta = yield* Effect.promise(() => deps.journalStore.readRunMeta(run.runId));
    if (meta !== undefined) {
      const ref: WorkflowRef = {
        kind: "workflow",
        path: ephemeralPath,
        absolutePath: ephemeralPath,
      };
      yield* Effect.promise(() =>
        deps.journalStore.writeRunMeta(run.runId, {
          ...meta,
          workflowVersion: workflowSourceVersion(ref),
        }),
      );
    }
  });

/** Mirror the HTTP control route's resume action: restore the parked continuation. */
export const makeResumePausedRun =
  <E>(deps: WorkflowResumeToolDeps<E>) =>
  (run: WorkflowRun): Effect.Effect<WorkflowResumeToolValue, string> =>
    Effect.gen(function* () {
      if (run.pendingCorrelationId === null) {
        return yield* Effect.fail("Paused workflow has no continuation to resume.");
      }
      const blocker = pausedResumeBlocker(deps, run);
      if (blocker !== null) return yield* Effect.fail(blocker);
      yield* deps.runRepository
        .resumePaused({ runId: run.runId, updatedAt: nowIso() })
        .pipe(Effect.mapError(errorMessage));
      workflowAdmissionQueue.resume(run.runId);
      if (run.pendingKind !== null && run.pendingThreadId !== null) {
        // Same sequence as the card's Resume (GHE #404): re-register with the re-drive budget
        // and re-drive a `thread.turn` at once, or the restored ask is never settled.
        yield* restorePausedPendingAsk(deps, run);
        return {
          ok: true as const,
          runId: run.runId,
          status: "suspended" as const,
          hint: "Restored the pending ask; the run resumes automatically when it resolves.",
        };
      }
      if (run.wakeAt !== null) {
        yield* Effect.promise(() => deps.rearmScheduler());
        return {
          ok: true as const,
          runId: run.runId,
          status: "sleeping" as const,
          hint: `Timer re-armed; the scheduler wakes the run at ${run.wakeAt}.`,
        };
      }
      return yield* Effect.fail("Paused workflow has no continuation to resume.");
    });
