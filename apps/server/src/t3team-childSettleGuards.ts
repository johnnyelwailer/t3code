/**
 * Fork settle guards over V2 lineage (the V1 engine's "a thread must not settle
 * while it, or its parent/child relation, is still live"). Consulted by the
 * orchestrator for every `thread.settle`, user and automatic alike, through the
 * `T3TeamSettleGuard` reference. A settle is refused when:
 *
 * - the thread launched a workflow run that has not finished (a user settle first stops runs
 *   that are only parked, see t3team-settleParkedWorkflowStop.ts; this guard just reads);
 * - one of its subagent children is live (an active run, or an unfinished
 *   workflow run of its own);
 * - its parent still waits for its result: an app-owned delegated task on it
 *   is unfinished, or its completion is not yet delivered to an unsettled parent;
 * - it is a settled-parent sweep settle and its parent is no longer settled
 *   (the parent un-settled after the sweep's snapshot).
 *
 * Read-only SQL on fork and V2 projection tables, lock-free (the orchestrator
 * holds the thread lock while it calls this). A failing read logs and allows.
 * @module t3team-childSettleGuards
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import { SETTLED_PARENT_SETTLE_COMMAND_PREFIX } from "./t3team-childSettleSweepDecide.ts";
import {
  combineSettleGuards,
  T3TeamSettleGuard,
  type T3TeamSettleGuardCheck,
} from "./t3team-v2/t3team-settleGuard.ts";
import { NON_TERMINAL_STATUSES } from "./t3team-workflowRunControlCas.ts";

/** Workflow statuses that are actively executing: a settle never stops these. */
export const ACTIVE_WORKFLOW_STATUSES = ["authoring", "queued", "running"] as const;
/** Parked workflow statuses (a clock, signal or ask wait, or a pause): a user settle stops them. */
export const PARKED_WORKFLOW_STATUSES = ["suspended", "sleeping", "watching", "paused"] as const;

const STOP_HOW =
  "the workflow run card's Stop button, or t3_orchestration_stop from the thread that launched it";

interface BlockingRunRow {
  readonly runId: string;
  readonly status: string;
}

const describeRuns = (rows: ReadonlyArray<BlockingRunRow>) =>
  rows.map((row) => `${row.runId} (${row.status})`).join(", ");

const ACTIVE_RUN_STATUSES = ["preparing", "starting", "running", "waiting"] as const;
const OPEN_TASK_STATUSES = ["pending", "running", "waiting"] as const;
const UNDELIVERED_STATES = ["pending", "claimed"] as const;

/**
 * Builds the combined check. `ownWorkflowStatuses` narrows which of the thread's own runs block:
 * the parked-run stop asks with the active statuses only, to learn whether stopping the parked
 * runs would let the settle through.
 */
export const makeChildSettleGuardChecks = (
  ownWorkflowStatuses: ReadonlyArray<string> = NON_TERMINAL_STATUSES,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rowsOrEmpty = <A, E>(label: string, query: Effect.Effect<ReadonlyArray<A>, E>) =>
      query.pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning(`t3team settle guard read failed: ${label}`, { cause }).pipe(
            Effect.as([] as ReadonlyArray<A>),
          ),
        ),
      );
    const exists = <E>(label: string, query: Effect.Effect<ReadonlyArray<unknown>, E>) =>
      rowsOrEmpty(label, query).pipe(Effect.map((rows) => rows.length > 0));
    const refuse =
      (
        reason: (threadId: ThreadId) => string,
        hit: (threadId: ThreadId) => Effect.Effect<boolean>,
      ) =>
      (threadId: ThreadId) =>
        hit(threadId).pipe(Effect.map((found) => (found ? reason(threadId) : null)));

    const ownWorkflow = (id: ThreadId) =>
      rowsOrEmpty(
        "workflow",
        sql<BlockingRunRow>`SELECT run_id AS "runId", status FROM workflow_runs
        WHERE launch_thread_id = ${id} AND ${sql.in("status", ownWorkflowStatuses)}
        ORDER BY updated_at DESC LIMIT 5`,
      ).pipe(
        Effect.map((rows) =>
          rows.length === 0
            ? null
            : `Thread ${id} has unfinished workflow runs: ${describeRuns(rows)}. It cannot be ` +
              `settled until they finish or are stopped with ${STOP_HOW}.`,
        ),
      );

    const liveChild = (id: ThreadId) =>
      rowsOrEmpty(
        "live child",
        sql<{
          readonly childId: string;
          readonly runs: string | null;
        }>`SELECT c.thread_id AS "childId",
          (SELECT group_concat(w.run_id || ' (' || w.status || ')', ', ') FROM workflow_runs w
            WHERE w.launch_thread_id = c.thread_id
              AND ${sql.in("w.status", NON_TERMINAL_STATUSES)}) AS "runs"
        FROM orchestration_v2_projection_threads c
        WHERE json_extract(c.payload_json, '$.lineage.parentThreadId') = ${id}
          AND json_extract(c.payload_json, '$.lineage.relationshipToParent') = 'subagent'
          AND c.deleted_at IS NULL
          AND (
            EXISTS (SELECT 1 FROM orchestration_v2_projection_runs r
              WHERE r.thread_id = c.thread_id AND ${sql.in("r.status", ACTIVE_RUN_STATUSES)})
            OR EXISTS (SELECT 1 FROM workflow_runs w
              WHERE w.launch_thread_id = c.thread_id AND ${sql.in("w.status", NON_TERMINAL_STATUSES)})
          )
        LIMIT 1`,
      ).pipe(
        Effect.map(([child]) =>
          child === undefined
            ? null
            : child.runs === null
              ? `Thread ${id} has a live child thread ${child.childId} (a turn is still running) ` +
                "and cannot be settled. Interrupt or settle the child first."
              : `Thread ${id} has a live child thread ${child.childId} with unfinished workflow ` +
                `runs: ${child.runs}. It cannot be settled until the child is settled (that stops ` +
                `its parked runs) or they are stopped with ${STOP_HOW}.`,
        ),
      );

    const parentWait = refuse(
      (id) => `The parent of thread ${id} still waits for its result; it cannot be settled yet.`,
      (id) =>
        exists(
          "parent wait",
          sql`SELECT 1 FROM orchestration_v2_projection_subagents s
          JOIN orchestration_v2_projection_threads p ON p.thread_id = s.thread_id
          WHERE s.child_thread_id = ${id} AND s.origin = 'app_owned'
            AND p.deleted_at IS NULL
            AND COALESCE(json_extract(p.payload_json, '$.settledOverride'), '') <> 'settled'
            AND (${sql.in("s.status", OPEN_TASK_STATUSES)}
              OR json_extract(s.payload_json, '$.completionDelivery.state')
                IN (${sql.literal(UNDELIVERED_STATES.map((state) => `'${state}'`).join(", "))}))
          LIMIT 1`,
        ),
    );

    const parentStillSettled = refuse(
      (id) => `The parent of thread ${id} is no longer settled.`,
      (id) =>
        exists(
          "settled parent",
          sql`SELECT 1 FROM orchestration_v2_projection_threads c
          LEFT JOIN orchestration_v2_projection_threads p
            ON p.thread_id = json_extract(c.payload_json, '$.lineage.parentThreadId')
          WHERE c.thread_id = ${id}
            AND COALESCE(json_extract(p.payload_json, '$.settledOverride'), '') <> 'settled'
          LIMIT 1`,
        ),
    );

    const check: T3TeamSettleGuardCheck = combineSettleGuards(
      (input) =>
        String(input.commandId).startsWith(SETTLED_PARENT_SETTLE_COMMAND_PREFIX)
          ? parentStillSettled(input.threadId)
          : Effect.succeed(null),
      (input) => ownWorkflow(input.threadId),
      (input) => liveChild(input.threadId),
      (input) => parentWait(input.threadId),
    );
    return check;
  });

/**
 * The ONE `T3TeamSettleGuard` override for the V2 runtime (server.ts). Other fork
 * features add their checks here with `combineSettleGuards`, never a second override.
 */
export const T3TeamSettleGuardsLive = Layer.effect(
  T3TeamSettleGuard,
  makeChildSettleGuardChecks().pipe(Effect.map((check) => ({ check }))),
);
