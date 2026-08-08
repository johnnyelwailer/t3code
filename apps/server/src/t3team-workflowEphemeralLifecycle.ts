/**
 * Builds the durable lifecycle for a prepared workflow run — the SQLite-backed row plus the
 * sleep/dispatch wiring the engine drives it through.
 *
 * Separate from `t3team-workflowEphemeralLaunch.ts` because this is where a run becomes RECOVERABLE:
 * the row is written before any detached execution starts, so a request disconnect leaves a run that
 * boot rehydration can find rather than an invisible source-only orphan. An `ephemeral` run enters
 * `queued` rather than `running` so the admission queue owns its promotion.
 */
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3team-workflowEngineDurability.ts";
import type {
  PreparedWorkflowLaunchDeps,
  PreparedWorkflowLaunchInput,
} from "./t3team-workflowEphemeralLaunchTypes.ts";

export function buildPreparedWorkflowLifecycle(input: {
  readonly deps: PreparedWorkflowLaunchDeps;
  readonly run: PreparedWorkflowLaunchInput;
  readonly nowIso: () => string;
}) {
  const { deps, run, nowIso } = input;
  return makeWorkflowRunLifecycle({
    repo: deps.runRepository,
    row: {
      ...buildRunningWorkflowRunRow({
        runId: run.runId,
        workflowPath: run.workflowPath,
        args: run.args,
        launchThreadId: run.launchThreadId,
        projectId: run.projectId,
        modelSelection: run.modelSelection,
        runtimeMode: run.runtimeMode,
        interactionMode: run.interactionMode,
        origin: run.origin,
        ...(run.recipePath === undefined ? {} : { recipePath: run.recipePath }),
        ...(run.hostToolGrant === undefined ? {} : { hostToolGrant: run.hostToolGrant }),
        nowIso: nowIso(),
      }),
      ...(run.origin === "ephemeral" ? { status: "queued" as const } : {}),
    },
    nowIso,
    onSleep: () => {
      void deps.rearmScheduler();
    },
    dispatch: deps.dispatch,
    newId: () => t3teamRandomUUID(),
  });
}
