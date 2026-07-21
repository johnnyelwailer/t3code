/**
 * The failed-run branch of `t3work.workflow.resume`, split from
 * {@link ./t3work-toolBrokerWorkflowResumeActions.ts} for the additive size budget:
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
} from "./t3work-toolBrokerWorkflowResumeActions.ts";
import type { WorkflowResumeToolValue } from "./t3work-toolBrokerWorkflowResumeTool.ts";
import { resolveWorkflowAgentModel } from "./t3work-workflowAgentModelPolicy.ts";
import { makeWorkflowRunLifecycle } from "./t3work-workflowEngineDurability.ts";
import { resumeWorkflowRunFromJournal } from "./t3work-workflowEngineResumeFromJournal.ts";
import { resolveRehydratedWorkflowScripts } from "./t3work-workflowRehydrateScripts.ts";

/** Re-drive a failed run from its journal, detached (a resume can park again for hours). */
export const makeResumeFailedRun =
  <E>(deps: WorkflowResumeToolDeps<E>, threadId: ThreadId, newId: () => string) =>
  (run: WorkflowRun): Effect.Effect<WorkflowResumeToolValue, string> =>
    Effect.gen(function* () {
      if (!deps.path) {
        return yield* Effect.fail(
          "Filesystem services are not available for t3work.workflow.resume in this runtime.",
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
          runsRoot: deps.path!.join(workspaceRoot, ".t3work-runs"),
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
        }),
      ).pipe(Effect.forkDetach({ startImmediately: true }));
      return {
        ok: true as const,
        runId: run.runId,
        status: "accepted" as const,
        hint: "Resuming from the journal (same-prefix replay); observe progress via t3work.workflow.status.",
      };
    });
