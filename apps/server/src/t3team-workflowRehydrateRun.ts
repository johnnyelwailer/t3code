/**
 * Turning one persisted workflow row back into a live run.
 *
 * Split from `t3team-workflowEngineRehydrate.ts`, which owns the boot-time sweep (which rows to
 * look at, in what order, and what to report). This module owns the per-run rebuild that sweep
 * performs, and the three pieces of it that carry real invariants:
 *
 *  - `hostToolClientFor` — the GRANT decides whether a restored run gets the host-tool bridge,
 *    never the shape of the row. A body replaying a journaled host-tool call evaluates
 *    `getTools().t3team…` before the journal is read, so dropping the bridge breaks a run that HAD
 *    it; handing it to a run that never had it would let a restart quietly upgrade a parked run's
 *    powers. `host_tool_grant` is NULL exactly when the launch wired no bridge (migration 047).
 *  - `rebuildController` — the resume closure (CODE from layers) rebuilt over the persisted DATA,
 *    shared by both wake sources so a run restored by the reactor and one restored by the scheduler
 *    drive forward identically.
 *  - `restartQueuedRun` — a durable queued row restarted through the same fair permit queue a fresh
 *    launch uses, so rehydration cannot jump the admission line.
 *
 * Every dependency is passed in rather than resolved here: this must not acquire services of its
 * own, or boot ordering would stop being the sweep's decision.
 */
import type { OrchestrationCommand } from "@t3tools/contracts";
import type { AnyScriptRef, JournalStore } from "@t3team/sdk";
import * as Effect from "effect/Effect";

import type {
  WorkflowRun,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { makeWorkflowRunLifecycle } from "./t3team-workflowEngineDurability.ts";
import {
  createWorkflowRunController,
  launchWorkflowRecipe,
} from "./t3team-workflowEngineLaunch.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import { resolveWorkflowAgentModel } from "./t3team-workflowAgentModelPolicy.ts";
import { makeT3TeamWorkflowHostDraftToolClient } from "./t3team-workflowHostDraftTools.ts";

/** Derived from the consumer rather than re-declared, so it cannot drift from the real broker. */
type HostDraftToolBroker = Parameters<typeof makeT3TeamWorkflowHostDraftToolClient>[0]["broker"];

export type WorkflowRunRehydratorDeps = {
  readonly repo: WorkflowRunRepositoryShape;
  readonly store: JournalStore;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly runsRoot: string;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly rearmScheduler: () => Promise<void>;
  readonly toolBroker: HostDraftToolBroker | undefined;
  readonly nowIso: () => string;
};

export function makeWorkflowRunRehydrator(deps: WorkflowRunRehydratorDeps) {
  const { repo, store, registry, runsRoot, dispatch, rearmScheduler, toolBroker, nowIso } = deps;

  const hostToolClientFor = (run: WorkflowRun) => {
    const grant = run.hostToolGrant;
    if (toolBroker === undefined || grant === undefined || grant === null) return undefined;
    return makeT3TeamWorkflowHostDraftToolClient({
      broker: toolBroker,
      launchThreadId: run.launchThreadId ?? undefined,
      ...(grant.toolGroups === null ? {} : { allowedToolGroups: grant.toolGroups }),
      // Same `dispatch` the rest of this rehydrator already drives the restored run with;
      // `draftChangeRequestReview` reuses it to publish its own carrier message on restart, same
      // as a fresh launch (t3team-workflowChangeRequestReviewDraftTool.ts).
      dispatch,
      // KNOWN GAP, stated rather than papered over: no `resolveSourceControlProviderKind` here.
      // The launch route resolves it from `project.workspaceRoot`
      // (`t3team-thread-recipe-workflow-routes.ts`), but `WorkflowRun` persists no workspace cwd
      // for a restored run to re-derive one from, and adding a column for it is a schema change
      // outside this rehydrator's scope (it must not acquire services of its own — see the module
      // doc comment above). A change-request review drafted by a run that restarted after a crash
      // therefore carries `target.provider: "unknown"` rather than a resolved kind — honest, and
      // never a silently wrong "github" guess; nothing about draft delivery itself is affected.
    });
  };

  const lifecycleFor = (run: WorkflowRun) =>
    makeWorkflowRunLifecycle({
      repo,
      row: run,
      nowIso,
      onSleep: () => {
        void rearmScheduler();
      },
      dispatch,
      newId: () => t3teamRandomUUID(),
    });

  /** Shared launch shape for a restored run, so rebuild and restart cannot drift apart. */
  const restoredRunOptions = (
    run: WorkflowRun,
    scripts: Readonly<Record<string, AnyScriptRef>>,
    lifecycle: ReturnType<typeof lifecycleFor>,
  ) => {
    const hostToolClient = hostToolClientFor(run);
    return {
      runId: run.runId,
      workflowPath: run.workflowPath,
      args: run.args,
      ...(Object.keys(scripts).length === 0 ? {} : { scripts }),
      ...(hostToolClient === undefined ? {} : { hostToolClient }),
      runsRoot,
      launchThreadId: run.launchThreadId ?? undefined,
      projectId: run.projectId,
      modelSelection: run.modelSelection,
      defaultAgentModelSelection: resolveWorkflowAgentModel(run.modelSelection),
      runtimeMode: run.runtimeMode,
      interactionMode: run.interactionMode,
      registry,
      dispatch,
      newId: () => t3teamRandomUUID(),
      nowIso,
      store,
      lifecycle,
    };
  };

  const registerMasterStop = (run: WorkflowRun): void => {
    registry.registerMasterStop(run.runId, () =>
      Effect.runPromise(
        repo.clearPending({ runId: run.runId, status: "cancelled", updatedAt: nowIso() }),
      ),
    );
  };

  const rebuildController = (
    run: WorkflowRun,
    scripts: Readonly<Record<string, AnyScriptRef>>,
  ): void => {
    createWorkflowRunController(restoredRunOptions(run, scripts, lifecycleFor(run)));
    registerMasterStop(run);
  };

  /**
   * Takes the script resolution as an EFFECT, not a value: ownership and the master stop must be
   * registered before scripts are resolved, so a stop arriving while that read is in flight is
   * still honoured. Passing resolved scripts in would silently move that registration later.
   */
  const restartQueuedRun = <E, R>(
    run: WorkflowRun,
    resolveScripts: Effect.Effect<Readonly<Record<string, AnyScriptRef>>, E, R>,
  ): Effect.Effect<void, E, R> =>
    Effect.gen(function* () {
      const lifecycle = lifecycleFor(run);
      registry.registerOwnership(run.runId, run.launchThreadId ?? undefined);
      registerMasterStop(run);
      const scripts = yield* resolveScripts;
      yield* Effect.promise(async () => {
        if (!(await lifecycle.recordActive())) return;
        await launchWorkflowRecipe({
          ...restoredRunOptions(run, scripts, lifecycle),
          lifecycleAlreadyRunning: true,
        });
      }).pipe(Effect.forkDetach({ startImmediately: true }));
    });

  return { hostToolClientFor, rebuildController, restartQueuedRun };
}
