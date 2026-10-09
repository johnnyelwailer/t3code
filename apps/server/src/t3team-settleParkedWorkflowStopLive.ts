/**
 * Wires the parked-run settle stop (t3team-settleParkedWorkflowStop.ts) from the server's engine
 * services for ws.ts. The services resolve optionally: a layer without the workflow engine
 * settles as before, with a warning naming what is missing.
 */
import type { OrchestrationV2Command } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import {
  ACTIVE_WORKFLOW_STATUSES,
  makeChildSettleGuardChecks,
} from "./t3team-childSettleGuards.ts";
import { settleWithParkedWorkflowRunsStopped } from "./t3team-settleParkedWorkflowStop.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost } from "./t3team-workflowHost.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";

/** Returns `(command, dispatch)`: for a `thread.settle`, stops the thread's parked workflow runs
 * before `dispatch`; any other command dispatches unchanged. */
export const makeSettleParkedWorkflowStop = Effect.gen(function* () {
  const repo = yield* Effect.serviceOption(WorkflowRunRepository);
  const registry = yield* Effect.serviceOption(T3TeamWorkflowEngineRegistry);
  const scheduler = yield* Effect.serviceOption(T3TeamWorkflowScheduler);
  const host = yield* Effect.serviceOption(T3TeamWorkflowHost);
  const sql = yield* Effect.serviceOption(SqlClient.SqlClient);
  if (
    Option.isNone(repo) ||
    Option.isNone(registry) ||
    Option.isNone(scheduler) ||
    Option.isNone(host) ||
    Option.isNone(sql)
  ) {
    const presence = {
      WorkflowRunRepository: Option.isSome(repo),
      T3TeamWorkflowEngineRegistry: Option.isSome(registry),
      T3TeamWorkflowScheduler: Option.isSome(scheduler),
      T3TeamWorkflowHost: Option.isSome(host),
      SqlClient: Option.isSome(sql),
    };
    yield* Effect.logWarning("a user settle will not stop parked workflow runs", {
      missing: Object.entries(presence)
        .filter(([, present]) => !present)
        .map(([name]) => name),
    });
    return <A, E, R>(_command: OrchestrationV2Command, dispatch: Effect.Effect<A, E, R>) =>
      dispatch;
  }
  const deps = {
    control: {
      repo: repo.value,
      registry: registry.value,
      host: host.value,
      rearmScheduler: () => scheduler.value.rearm(),
      nowIso: () => DateTime.formatIso(DateTime.nowUnsafe()),
    },
    guardIgnoringParkedRuns: yield* makeChildSettleGuardChecks(ACTIVE_WORKFLOW_STATUSES).pipe(
      Effect.provideService(SqlClient.SqlClient, sql.value),
    ),
  };
  return <A, E, R>(command: OrchestrationV2Command, dispatch: Effect.Effect<A, E, R>) =>
    command.type === "thread.settle"
      ? settleWithParkedWorkflowRunsStopped(deps, command, dispatch)
      : dispatch;
});
