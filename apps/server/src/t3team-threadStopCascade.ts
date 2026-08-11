/**
 * Cascade stop: given a thread, interrupt its active turn AND every descendant
 * thread's active turn (walking the `t3team.handoff.started` parent→child
 * relations that both `start_child` and workflow child placement record — see
 * t3team-thread-placement-routes.ts for the sibling upward walk).
 *
 * This is deliberately independent of `t3team-workflowStopCascade.ts`, which
 * only reaches children a workflow RUN owns in its in-memory registry. A
 * cascade stop must also reach children spawned by `start_child` (no workflow
 * run at all) and workflow children after the launching run itself has ended,
 * so it re-derives the tree from the persisted handoff activities instead.
 *
 * @module t3team-threadStopCascade
 */
import { CommandId, ThreadId, type OrchestrationCommand } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";

interface HandoffStartedRow {
  readonly childThreadId: string | null;
}

/**
 * BFS over `t3team.handoff.started` activities: each hop reads the direct
 * children of the threads discovered in the previous hop. `visited` guards
 * against a cycle (should never occur, but a bad handoff record must not hang
 * the stop) and against revisiting a thread reachable through two parents.
 */
export const loadT3TeamThreadDescendants = (
  rootThreadId: string,
): Effect.Effect<ReadonlyArray<string>, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const visited = new Set<string>([rootThreadId]);
    const descendants: string[] = [];
    let frontier = [rootThreadId];

    while (frontier.length > 0) {
      const rows = yield* Effect.forEach(
        frontier,
        (parentId) =>
          sql<HandoffStartedRow>`
            SELECT
              NULLIF(TRIM(CAST(json_extract(payload_json, '$.childThreadId') AS TEXT)), '') AS "childThreadId"
            FROM projection_thread_activities
            WHERE thread_id = ${parentId} AND kind = 't3team.handoff.started'
          `,
        { concurrency: "unbounded" },
      ).pipe(Effect.map((perParent) => perParent.flat()));

      const nextFrontier: string[] = [];
      for (const row of rows) {
        const childId = row.childThreadId;
        if (!childId || visited.has(childId)) continue;
        visited.add(childId);
        descendants.push(childId);
        nextFrontier.push(childId);
      }
      frontier = nextFrontier;
    }

    return descendants;
  }).pipe(Effect.catchCause(() => Effect.succeed([])));

/**
 * Interrupt every descendant of `threadId` (NOT `threadId` itself — the
 * caller already interrupted that one; this only fans out to the tree below
 * it). Each descendant interrupt carries the same `t3teamStopOrigin` as the
 * triggering stop, so a user-raised cascade suppresses actor auto-dispatch on
 * every descendant exactly like it does on the root.
 */
export const stopThreadDescendants = (input: {
  readonly threadId: string;
  readonly createdAt: string;
  readonly byUser: boolean;
  readonly dispatch: OrchestrationEngineShape["dispatch"];
}): Effect.Effect<void, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const descendants = yield* loadT3TeamThreadDescendants(input.threadId);
    yield* Effect.forEach(
      descendants,
      (descendantThreadId) =>
        input
          .dispatch({
            type: "thread.turn.interrupt",
            commandId: CommandId.make(
              `t3team-cascade-stop:${input.threadId}:${descendantThreadId}`,
            ),
            threadId: ThreadId.make(descendantThreadId),
            t3teamStopOrigin: input.byUser ? "user" : "system",
            createdAt: input.createdAt,
          })
          .pipe(Effect.catchCause(() => Effect.void)),
      { concurrency: 1 },
    );
  });
