/**
 * The workflow facts of a launch thread, derived from the durable `workflow_runs` table: the
 * latest run's status (the sidebar's status pill) and the soonest wake of its sleeping runs (the
 * dormant-routine pill). They travel on the fork thread-facts side stream
 * (`T3TeamThreadFactsStore`); the host re-derives and patches them on every run transition.
 */
import { OrchestrationWorkflowRunStatus } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as SqlClient from "effect/unstable/sql/SqlClient";

import type { T3TeamThreadFactsPatch } from "./t3team-v2/t3team-threadFactsStore.ts";

// A row whose status the contract does not know (schema drift) reads as "no run".
const decodeLatestRun = Schema.decodeUnknownOption(OrchestrationWorkflowRunStatus);

/** The facts patch for `launchThreadId`; a thread that never launched a run clears both facts. */
export const readWorkflowRunFacts = (sql: SqlClient.SqlClient, launchThreadId: string) =>
  Effect.gen(function* () {
    const latestRows = yield* sql`
      SELECT run_id AS "runId", status, pending_kind AS "pendingKind", wake_at AS "wakeAt",
        updated_at AS "updatedAt"
      FROM workflow_runs WHERE launch_thread_id = ${launchThreadId}
      ORDER BY updated_at DESC, run_id DESC LIMIT 1
    `;
    const sleepingRows = yield* sql<{ readonly wakeAt: string }>`
      SELECT wake_at AS "wakeAt" FROM workflow_runs
      WHERE status = 'sleeping' AND wake_at IS NOT NULL AND launch_thread_id = ${launchThreadId}
      ORDER BY wake_at ASC LIMIT 1
    `;
    return {
      workflowRunStatus: Option.getOrNull(decodeLatestRun(latestRows[0])),
      sleepingUntil: sleepingRows[0]?.wakeAt ?? null,
    } satisfies T3TeamThreadFactsPatch;
  });
