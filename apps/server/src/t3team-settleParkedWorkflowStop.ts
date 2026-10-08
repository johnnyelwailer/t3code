/**
 * A user's settle of a thread whose only unfinished workflow runs are PARKED (sleeping on a
 * clock, watching a signal, suspended on an ask, or paused) stops those runs first, through the
 * same `controlWorkflowRun` stop as the card's Stop button, so the settle is not a dead end. An
 * ephemeral recurring run that re-wakes its thread for a month must not make the thread
 * unsettleable.
 *
 * Runs here, at the user's command intake (ws.ts), before the orchestrator dispatch: the settle
 * guard runs under the thread lock and must stay read-only, while a stop writes the run row and
 * interrupts child threads (commands on other threads). Not applied to server-originated settles
 * (auto-settle, the child sweeper): work is never cancelled on a timer. A run that is actively
 * executing, or any other settle blocker, leaves everything untouched and the guard's refusal
 * explains what to do. A failed stop is logged; the guard then refuses with the run named.
 */
import type { CommandId, OrchestrationV2Command, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import {
  ACTIVE_WORKFLOW_STATUSES,
  makeChildSettleGuardChecks,
  PARKED_WORKFLOW_STATUSES,
} from "./t3team-childSettleGuards.ts";
import { settleGuardInput, type T3TeamSettleGuardCheck } from "./t3team-v2/t3team-settleGuard.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost } from "./t3team-workflowHost.ts";
import { controlWorkflowRun, type WorkflowRunControlDeps } from "./t3team-workflowRunControl.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";

export interface SettleParkedWorkflowStopDeps {
  readonly control: Omit<WorkflowRunControlDeps, "stopOrigin">;
  /** The settle guard with only actively executing own runs blocking. */
  readonly guardIgnoringParkedRuns: T3TeamSettleGuardCheck;
}

const parked = new Set<string>(PARKED_WORKFLOW_STATUSES);

/** Stops the thread's parked runs when that alone would let a user settle through; returns the
 * ids of the runs it stopped. */
export const stopParkedWorkflowRunsForSettle = Effect.fn("stopParkedWorkflowRunsForSettle")(
  function* (
    deps: SettleParkedWorkflowStopDeps,
    command: { readonly threadId: ThreadId; readonly commandId: CommandId },
  ) {
    const input = settleGuardInput(command);
    if (input.origin !== "user") return [];
    const runs = yield* deps.control.repo
      .listLiveByLaunchThread({ launchThreadId: command.threadId })
      .pipe(
        Effect.catch((error) =>
          Effect.logWarning("settle could not list workflow runs", { error }).pipe(Effect.as([])),
        ),
      );
    if (runs.length === 0 || runs.some((run) => !parked.has(run.status))) return [];
    if ((yield* deps.guardIgnoringParkedRuns(input)) !== null) return [];
    const stopped: Array<string> = [];
    for (const run of runs) {
      yield* controlWorkflowRun({ ...deps.control, stopOrigin: "user" }, run, {
        threadId: command.threadId,
        action: "stop",
      }).pipe(
        Effect.tap(() => Effect.sync(() => stopped.push(run.runId))),
        Effect.catch((message) =>
          Effect.logWarning("settle could not stop a parked workflow run", {
            runId: run.runId,
            message,
          }),
        ),
      );
    }
    return stopped;
  },
);

/** Resolves the engine services optionally (layers without the workflow engine settle as
 * before) and returns the pre-settle step for `thread.settle` commands. */
export const makeSettleParkedWorkflowStop = Effect.gen(function* () {
  const repo = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowRunRepository));
  const registry = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamWorkflowEngineRegistry));
  const scheduler = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamWorkflowScheduler));
  const host = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamWorkflowHost));
  const sql = Option.getOrUndefined(yield* Effect.serviceOption(SqlClient.SqlClient));
  if (!repo || !registry || !scheduler || !host || !sql) {
    return (_command: OrchestrationV2Command) => Effect.void;
  }
  const deps: SettleParkedWorkflowStopDeps = {
    control: {
      repo,
      registry,
      host,
      rearmScheduler: () => scheduler.rearm(),
      nowIso: () => DateTime.formatIso(DateTime.nowUnsafe()),
    },
    guardIgnoringParkedRuns: yield* makeChildSettleGuardChecks(ACTIVE_WORKFLOW_STATUSES).pipe(
      Effect.provideService(SqlClient.SqlClient, sql),
    ),
  };
  return (command: OrchestrationV2Command) =>
    command.type === "thread.settle"
      ? stopParkedWorkflowRunsForSettle(deps, command).pipe(Effect.asVoid)
      : Effect.void;
});
