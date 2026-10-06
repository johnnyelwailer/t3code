/**
 * The `t3team.orchestration.resume` action implementations, split from
 * {@link ./t3team-toolBrokerWorkflowResumeTool.ts} for the additive size budget:
 * optional corrected-source replacement (ephemeral runs only), the paused-run continuation
 * restore (mirrors the HTTP control route). The failed-run journal re-drive lives in
 * ./t3team-toolBrokerWorkflowResumeFailed.ts (additive size budget).
 */
import type { ServerProvider, ThreadId } from "@t3tools/contracts";
import { hashArgs, workflowSourceVersion, type JournalStore, type WorkflowRef } from "@t3team/sdk";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type {
  WorkflowRun,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import type { WorkflowSignalStoreShape } from "./persistence/Services/WorkflowSignalStore.ts";
import type {
  ResumeWorkflowHandlerArgs,
  WorkflowResumeToolValue,
} from "./t3team-toolBrokerWorkflowResumeTool.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import type { InterruptedTurnRetry } from "./t3team-workflowEngineTurnRetry.ts";
import { replaceEphemeralWorkflowSourceAtomically } from "./t3team-workflowEphemeralSource.ts";
import type { WorkflowHostPort } from "./t3team-workflowHostPort.ts";
import {
  pausedResumeBlocker,
  restorePausedRunContinuation,
} from "./t3team-workflowResumePausedTurn.ts";
import { checkWorkflowSource, formatWorkflowSourceFindings } from "./t3team-workflowSourceCheck.ts";

export interface WorkflowResumeToolDeps<E = string> {
  readonly fileSystem?: FileSystem.FileSystem | undefined;
  readonly path?: Path.Path | undefined;
  readonly runRepository: WorkflowRunRepositoryShape;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly journalStore: JournalStore;
  readonly rearmScheduler: () => Promise<void>;
  /** The thread operations a re-driven run performs (`T3TeamWorkflowHost`). */
  readonly host: WorkflowHostPort;
  readonly loadThreadProject: (
    threadId: ThreadId,
  ) => Effect.Effect<
    { readonly project: { readonly workspaceRoot: string | null | undefined } },
    E
  >;
  /** Re-issues a failed run's retained `thread.turn` step (GHE #403). Absent when the broker's
   * environment has no workflow host; the failed-step resume then reports so. */
  readonly turnRedrive?: InterruptedTurnRetry | undefined;
  /** Durable signal-source state (GHE #332); absent in test/broker layers without the engine —
   * the signal-park resume then skips the inbox drain (there is no inbox to drain there). */
  readonly signalStore?: WorkflowSignalStoreShape | undefined;
  /** Live provider snapshots for the corrected-source check's model gate; absent skips that gate. */
  readonly listProviders?: (() => Effect.Effect<ReadonlyArray<ServerProvider>>) | undefined;
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

/**
 * Persist corrected launch args before a FAILED run's journal re-drive reads them. Only a failed
 * run: a paused run is mid-flight, and the body already read its inputs. The engine decodes the
 * new args against `meta.inputs` when it re-drives (`WorkflowInputDecodeError` names an input
 * fault precisely), so a still-wrong value fails the same way and the caller learns it at once.
 */
export const replaceRunArgsIfRequested = <E>(
  deps: WorkflowResumeToolDeps<E>,
  run: WorkflowRun,
  args: ResumeWorkflowHandlerArgs["args"],
): Effect.Effect<WorkflowRun, string> =>
  Effect.gen(function* () {
    if (args === undefined) return run;
    if (run.status !== "failed") {
      return yield* Effect.fail(
        "Corrected args are only supported for a FAILED run (its body re-reads them on the " +
          "re-drive); a paused run keeps the inputs it is already running with.",
      );
    }
    const argsHash = hashArgs(args);
    yield* deps.runRepository
      .updateArgs({ runId: run.runId, args, argsHash, updatedAt: nowIso() })
      .pipe(Effect.mapError(errorMessage));
    // The journal's run meta pins the launch args too (`engineValidation.ts` refuses a resume whose
    // args hash differs — replay drift). A supplied correction is an explicit decision, so it becomes
    // the new baseline there as well, exactly as a corrected source re-baselines `workflowVersion`.
    const meta = yield* Effect.promise(() => deps.journalStore.readRunMeta(run.runId));
    if (meta !== undefined) {
      yield* Effect.promise(() => deps.journalStore.writeRunMeta(run.runId, { ...meta, argsHash }));
    }
    return { ...run, args, argsHash };
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
        "Filesystem services are not available for t3_orchestration_resume in this runtime.",
      );
    }
    const workspaceRoot = yield* workspaceRootFor(deps, threadId);
    const runsRoot = deps.path.join(workspaceRoot, ".t3team-runs");
    const ephemeralPath = deps.path.join(runsRoot, run.runId, "workflow.ts");
    // The SAME full check every launch and author submission passes — never the format precheck
    // alone (review of fork #349): a corrected source with an unbound import or a dead model slug
    // must be refused here, not die at the re-drive.
    const providers = deps.listProviders === undefined ? undefined : yield* deps.listProviders();
    const verdict = checkWorkflowSource({
      source: trimmed,
      absolutePath: ephemeralPath,
      providers,
      baseModelSelection: run.modelSelection,
    });
    if (!verdict.ok) {
      return yield* Effect.fail(
        `Corrected source was not accepted:\n${formatWorkflowSourceFindings(verdict.findings)}`,
      );
    }
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
      // Same sequence as the card's Resume (GHE #332): one of the three continuations — thread
      // ask, clock, or event park — restored with its matching follow-through.
      // `R = never` contract: an event-park drain warning (best-effort) is not logged here —
      // the run lands in `watching` either way and the next live event re-delivers the wake.
      const { status } = yield* restorePausedRunContinuation({
        registry: deps.registry,
        run,
        rearmScheduler: deps.rearmScheduler,
        nowIso,
        ...(deps.turnRedrive === undefined ? {} : { turnRedrive: deps.turnRedrive }),
        ...(deps.signalStore === undefined ? {} : { signalStore: deps.signalStore }),
      });
      if (status === "suspended") {
        return {
          ok: true as const,
          runId: run.runId,
          status: "suspended" as const,
          hint: "Restored the pending ask; the run resumes automatically when it resolves.",
        };
      }
      if (status === "sleeping") {
        return {
          ok: true as const,
          runId: run.runId,
          status: "sleeping" as const,
          hint: `Timer re-armed; the scheduler wakes the run at ${run.wakeAt}.`,
        };
      }
      return {
        ok: true as const,
        runId: run.runId,
        status: "watching" as const,
        hint: "Restored the event park; the run wakes when its awaited signal event lands.",
      };
    });
