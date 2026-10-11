/**
 * Reconciles the `thread.pendingWorkflowAsk` mirror (t3team-v2/t3team-threadWorkflowAsk.ts)
 * from the durable `workflow_runs` table, so a workflow waiting on the user's answer shows as
 * pending user input on the V2 shell — the signal notifications and the sidebar watch.
 *
 * An ask is live while its run is `suspended` on a `user.input` with a pending thread. Answering
 * flips the run back to `running`; finishing, failing or stopping it clears the pending columns.
 * The host runs this next to the run facts on every run transition of a launch thread
 * (`T3TeamWorkflowHost.syncRunFacts`), covering both the threads this launch's runs ask on now
 * and the threads still carrying a mirror from one of them.
 */
import type { OrchestrationV2PendingWorkflowAsk } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/sql/SqlClient";

import type { T3TeamThreadWorkflowAsk } from "./t3team-v2/t3team-threadWorkflowAsk.ts";

interface LiveAskRow {
  readonly runId: string;
  readonly threadId: string;
  readonly correlationId: string;
  readonly updatedAt: string;
}

/** The newest live ask per thread; a thread absent from the map has none. */
function liveAskByThread(
  rows: ReadonlyArray<LiveAskRow>,
): ReadonlyMap<string, OrchestrationV2PendingWorkflowAsk> {
  const latest = new Map<string, LiveAskRow>();
  for (const row of rows) {
    const current = latest.get(row.threadId);
    if (current === undefined || row.updatedAt > current.updatedAt) latest.set(row.threadId, row);
  }
  return new Map(
    Array.from(latest, ([threadId, row]) => [
      threadId,
      { runId: row.runId, correlationId: row.correlationId, createdAt: row.updatedAt },
    ]),
  );
}

export const syncWorkflowAskMirrors = (input: {
  readonly sql: SqlClient.SqlClient;
  readonly writer: T3TeamThreadWorkflowAsk["Service"];
  readonly launchThreadId: string;
}) =>
  Effect.gen(function* () {
    const { sql, launchThreadId } = input;
    const asking = yield* sql<{ readonly threadId: string }>`
      SELECT DISTINCT pending_thread_id AS "threadId" FROM workflow_runs
      WHERE launch_thread_id = ${launchThreadId} AND status = 'suspended'
        AND pending_kind = 'user.input' AND pending_thread_id IS NOT NULL
    `;
    const mirrored = yield* sql<{ readonly threadId: string }>`
      SELECT thread_id AS "threadId" FROM orchestration_v2_projection_threads
      WHERE deleted_at IS NULL AND json_valid(payload_json)
        AND json_extract(payload_json, '$.pendingWorkflowAsk.runId') IN (
          SELECT run_id FROM workflow_runs WHERE launch_thread_id = ${launchThreadId}
        )
    `;
    const threadIds = [...new Set([...asking, ...mirrored].map((row) => row.threadId))];
    if (threadIds.length === 0) return;
    // Any run may ask on a candidate thread, not only this launch's: never clear another's ask.
    const live = liveAskByThread(
      yield* sql<LiveAskRow>`
        SELECT run_id AS "runId", pending_thread_id AS "threadId",
          pending_correlation_id AS "correlationId", updated_at AS "updatedAt"
        FROM workflow_runs
        WHERE status = 'suspended' AND pending_kind = 'user.input'
          AND pending_correlation_id IS NOT NULL
          AND ${sql.in("pending_thread_id", threadIds)}
      `,
    );
    yield* Effect.forEach(
      threadIds,
      (threadId) =>
        input.writer.setPendingWorkflowAsk(ThreadId.make(threadId), live.get(threadId) ?? null),
      { discard: true },
    );
  });
