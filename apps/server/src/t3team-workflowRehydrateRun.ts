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
import type { AnyScriptRef, JournalStore } from "@t3team/sdk";
import * as Effect from "effect/Effect";

import type { WorkflowRun, WorkflowRunRepositoryShape } from "./persistence/WorkflowRuns.ts";
import type { WorkflowSignalStoreShape } from "./persistence/WorkflowSignalStore.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { makeWorkflowRunLifecycle } from "./t3team-workflowEngineDurability.ts";
import {
  createWorkflowRunController,
  launchWorkflowRecipe,
} from "./t3team-workflowEngineLaunch.ts";
import type { T3TeamWorkflowEngineRegistryShape } from "./t3team-workflowEngineRegistry.ts";
import { resolveWorkflowAgentModel } from "./t3team-workflowAgentModelPolicy.ts";
import { makeT3TeamWorkflowHostToolClient } from "./t3team-workflowHostTools.ts";
import type { T3TeamScriptHost } from "./t3team-scriptHostContext.ts";
import type { WorkflowHostPort } from "./t3team-workflowHostPort.ts";

/** Derived from the consumer rather than re-declared, so it cannot drift from the real broker. */
type HostToolBroker = Parameters<typeof makeT3TeamWorkflowHostToolClient>[0]["broker"];

export type WorkflowRunRehydratorDeps = {
  readonly repo: WorkflowRunRepositoryShape;
  readonly store: JournalStore;
  readonly registry: T3TeamWorkflowEngineRegistryShape;
  readonly runsRoot: string;
  readonly host: WorkflowHostPort;
  readonly rearmScheduler: () => Promise<void>;
  readonly toolBroker: HostToolBroker | undefined;
  readonly nowIso: () => string;
  /** Durable signal-source state (GHE #332); absent when the host did not wire it (tests).
   * Restored runs replay new `signal.wait`/`signal.register` verbs against it. */
  readonly signalStore?: WorkflowSignalStoreShape | undefined;
  /** Rebuilds a restored run's `ctx.store` / `ctx.changeRequests` from its row; absent in tests
   * that wire no script host, whose scripts then see neither. */
  readonly scriptHost?: T3TeamScriptHost["Service"] | undefined;
};

export function makeWorkflowRunRehydrator(deps: WorkflowRunRehydratorDeps) {
  const { repo, store, registry, runsRoot, host, rearmScheduler, toolBroker, nowIso, signalStore } =
    deps;

  // The same entitlement the launch used: the row's recipe and its persisted host-tool grant.
  const scriptHostFor = (run: WorkflowRun) =>
    deps.scriptHost?.forRun({
      projectId: run.projectId,
      recipePath: run.recipePath,
      toolGroups: run.hostToolGrant?.toolGroups,
    });

  const hostToolClientFor = (run: WorkflowRun) => {
    const grant = run.hostToolGrant;
    if (toolBroker === undefined || grant === undefined || grant === null) return undefined;
    return makeT3TeamWorkflowHostToolClient({
      broker: toolBroker,
      launchThreadId: run.launchThreadId ?? undefined,
      ...(grant.toolGroups === null ? {} : { allowedToolGroups: grant.toolGroups }),
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
      host,
    });

  /** Shared launch shape for a restored run, so rebuild and restart cannot drift apart. */
  const restoredRunOptions = (
    run: WorkflowRun,
    scripts: Readonly<Record<string, AnyScriptRef>>,
    lifecycle: ReturnType<typeof lifecycleFor>,
  ) => {
    const hostToolClient = hostToolClientFor(run);
    const scriptHost = Object.keys(scripts).length === 0 ? undefined : scriptHostFor(run);
    return {
      runId: run.runId,
      workflowPath: run.workflowPath,
      args: run.args,
      ...(Object.keys(scripts).length === 0 ? {} : { scripts }),
      ...(hostToolClient === undefined ? {} : { hostToolClient }),
      ...(scriptHost === undefined ? {} : { scriptHost }),
      runsRoot,
      launchThreadId: run.launchThreadId ?? undefined,
      projectId: run.projectId,
      modelSelection: run.modelSelection,
      defaultAgentModelSelection: resolveWorkflowAgentModel(run.modelSelection),
      runtimeMode: run.runtimeMode,
      interactionMode: run.interactionMode,
      registry,
      host,
      newId: () => t3teamRandomUUID(),
      nowIso,
      store,
      lifecycle,
      ...(signalStore === undefined ? {} : { signalStore }),
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
