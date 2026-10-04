/**
 * The failed-run branch of `t3team.orchestration.resume`, split from
 * {@link ./t3team-toolBrokerWorkflowResumeActions.ts} for the additive size budget:
 * re-resolve recipe scripts exactly as boot rehydration does, rebuild the durable lifecycle
 * over the persisted row, then either
 *   • re-drive the run's RETAINED `thread.turn` step ({@link resumeFailedTurnStep}) when the
 *     failure was the host's verdict on an unanswered agent turn (GHE #403), or
 *   • re-drive {@link resumeWorkflowRunFromJournal} detached for a body-thrown failure.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { WorkflowRun } from "./persistence/Services/WorkflowRuns.ts";
import {
  nowIso,
  workspaceRootFor,
  type WorkflowResumeToolDeps,
} from "./t3team-toolBrokerWorkflowResumeActions.ts";
import type { WorkflowResumeToolValue } from "./t3team-toolBrokerWorkflowResumeTool.ts";
import { resolveWorkflowAgentModel } from "./t3team-workflowAgentModelPolicy.ts";
import { makeWorkflowRunLifecycle } from "./t3team-workflowEngineDurability.ts";
import type { LaunchWorkflowRecipeInput } from "./t3team-workflowEngineLaunchTypes.ts";
import { resumeFailedTurnStep } from "./t3team-workflowEngineResumeFailedStep.ts";
import { resumeWorkflowRunFromJournal } from "./t3team-workflowEngineResumeFromJournal.ts";
import { resolveRehydratedWorkflowScripts } from "./t3team-workflowRehydrateScripts.ts";

/** The retained `thread.turn` ask of a host-failed run, or `null` for a body-thrown failure. */
export function retainedFailedTurnStep(
  run: WorkflowRun,
): { readonly threadId: string; readonly correlationId: string } | null {
  if (
    run.pendingKind !== "thread.turn" ||
    run.pendingThreadId === null ||
    run.pendingCorrelationId === null
  ) {
    return null;
  }
  return { threadId: run.pendingThreadId, correlationId: run.pendingCorrelationId };
}

/** Re-drive a failed run from its journal, detached (a resume can park again for hours).
 *
 * T3Team's existing orchestration-resume surface historically resumed the workflow currently
 * present at its path. Keep that behavior here for v1: the reusable core remains strict by
 * default, while this adapter accepts a changed source and records its identity as the new
 * baseline. Callers that need strict checking can still pass it explicitly.
 */
export const makeResumeFailedRun =
  <E>(
    deps: WorkflowResumeToolDeps<E>,
    threadId: ThreadId,
    newId: () => string,
    workflowVersionPolicy: "strict" | "allow-change" = "allow-change",
  ) =>
  (run: WorkflowRun): Effect.Effect<WorkflowResumeToolValue, string> =>
    Effect.gen(function* () {
      if (!deps.path) {
        return yield* Effect.fail(
          "Filesystem services are not available for t3team.orchestration.resume in this runtime.",
        );
      }
      const workspaceRoot = yield* workspaceRootFor(deps, threadId);
      // Recipe-private scripts re-resolve exactly as boot rehydration does (migration 043).
      let scriptsEffect = resolveRehydratedWorkflowScripts(run);
      if (deps.fileSystem !== undefined) {
        scriptsEffect = scriptsEffect.pipe(
          Effect.provideService(FileSystem.FileSystem, deps.fileSystem),
          Effect.provideService(Path.Path, deps.path),
        );
      }
      const scripts = yield* scriptsEffect;
      const lifecycle = makeWorkflowRunLifecycle({
        repo: deps.runRepository,
        row: run,
        nowIso,
        onSleep: () => {
          void deps.rearmScheduler();
        },
        dispatch: deps.dispatch,
        newId,
      });
      const launch: LaunchWorkflowRecipeInput = {
        runId: run.runId,
        workflowPath: run.workflowPath,
        args: run.args,
        ...(Object.keys(scripts).length === 0 ? {} : { scripts }),
        runsRoot: deps.path!.join(workspaceRoot, ".t3team-runs"),
        launchThreadId: run.launchThreadId ?? undefined,
        projectId: run.projectId,
        modelSelection: run.modelSelection,
        defaultAgentModelSelection: resolveWorkflowAgentModel(run.modelSelection),
        runtimeMode: run.runtimeMode,
        interactionMode: run.interactionMode,
        registry: deps.registry,
        dispatch: deps.dispatch,
        newId,
        nowIso,
        store: deps.journalStore,
        lifecycle,
        workflowVersionPolicy,
      };
      const failure = {
        ...(run.failureReason ? { failureReason: run.failureReason } : {}),
        ...(run.failureStep ? { failureStep: run.failureStep } : {}),
      };
      // A host-detected step failure (the agent turn died or said nothing) keeps its pending
      // ask on the row; re-drive THAT step. A journal replay would park on its `sent` entry.
      const retained = retainedFailedTurnStep(run);
      if (retained !== null) {
        if (deps.turnRedrive === undefined) {
          return yield* Effect.fail(
            "Re-driving a failed agent step is not available in this runtime (no thread query / dispatch).",
          );
        }
        yield* resumeFailedTurnStep({
          launch,
          step: retained,
          runRepository: deps.runRepository,
          turnRedrive: deps.turnRedrive,
        });
        return {
          ok: true as const,
          runId: run.runId,
          status: "suspended" as const,
          ...failure,
          hint: run.failureReason
            ? `Re-driving the failed agent step after: ${run.failureReason} — the run resumes automatically when the step answers; observe progress via t3team.orchestration.status.`
            : "Re-driving the failed agent step; the run resumes automatically when it answers — observe progress via t3team.orchestration.status.",
        };
      }
      yield* Effect.promise(() => resumeWorkflowRunFromJournal(launch)).pipe(
        Effect.forkDetach({ startImmediately: true }),
      );
      // Echo the recorded cause of the PREVIOUS failure: the resume replays the executed prefix
      // and runs live past it, so an agent that did not first call `status` still learns what
      // broke and can judge whether resuming without a fix can possibly succeed.
      return {
        ok: true as const,
        runId: run.runId,
        status: "accepted" as const,
        ...failure,
        hint: run.failureReason
          ? `Resuming from the journal (same-prefix replay) after: ${run.failureReason} — observe progress via t3team.orchestration.status.`
          : "Resuming from the journal (same-prefix replay); observe progress via t3team.orchestration.status.",
      };
    });
