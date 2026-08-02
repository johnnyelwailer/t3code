/**
 * The failed-run branch of `t3team.orchestration.resume`, split from
 * {@link ./t3team-toolBrokerWorkflowResumeActions.ts} for the additive size budget:
 * re-resolve recipe scripts exactly as boot rehydration does, rebuild the durable lifecycle
 * over the persisted row, and re-drive {@link resumeWorkflowRunFromJournal} detached.
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
import { resumeWorkflowRunFromJournal } from "./t3team-workflowEngineResumeFromJournal.ts";
import { resolveRehydratedWorkflowScripts } from "./t3team-workflowRehydrateScripts.ts";

/** Re-drive a failed run from its journal, detached (a resume can park again for hours). */
export const makeResumeFailedRun =
  <E>(
    deps: WorkflowResumeToolDeps<E>,
    threadId: ThreadId,
    newId: () => string,
    workflowVersionPolicy: "strict" | "allow-change" = "strict",
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
      yield* Effect.promise(() =>
        resumeWorkflowRunFromJournal({
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
        }),
      ).pipe(Effect.forkDetach({ startImmediately: true }));
      // Echo the recorded cause of the PREVIOUS failure: the resume replays the executed prefix
      // and runs live past it, so an agent that did not first call `status` still learns what
      // broke and can judge whether resuming without a fix can possibly succeed.
      return {
        ok: true as const,
        runId: run.runId,
        status: "accepted" as const,
        ...(run.failureReason ? { failureReason: run.failureReason } : {}),
        ...(run.failureStep ? { failureStep: run.failureStep } : {}),
        hint: run.failureReason
          ? `Resuming from the journal (same-prefix replay) after: ${run.failureReason} — observe progress via t3team.orchestration.status.`
          : "Resuming from the journal (same-prefix replay); observe progress via t3team.orchestration.status.",
      };
    });
