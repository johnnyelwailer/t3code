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
import { CommandId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
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
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("t3team failed to load thread descendants for a cascade stop", {
        rootThreadId,
        cause: Cause.pretty(cause),
      }).pipe(Effect.as([])),
    ),
  );

/**
 * Interrupt every descendant of `threadId` (NOT `threadId` itself — the
 * caller already interrupted that one; this only fans out to the tree below
 * it). Each descendant interrupt carries the same `t3teamStopOrigin` as the
 * triggering stop, so a user-raised cascade suppresses actor auto-dispatch on
 * every descendant exactly like it does on the root.
 *
 * `triggerEventId` (the `thread.turn-interrupt-requested` event that raised
 * this cascade) — NOT a random id — seeds every descendant's `commandId`.
 * Command receipts are persisted with `command_id` as a SQL PRIMARY KEY and
 * the engine short-circuits redelivery of a command id it has already seen
 * (even a rejected one) forever; keying on the triggering event keeps
 * redelivery of the SAME cascade idempotent while still letting a LATER
 * cascade stop (a new interrupt event, a new eventId) reach a child that a
 * previous cascade failed to stop or that has since resumed. A per-pair
 * constant id would instead poison that pair permanently after one failure.
 *
 * A dispatch failure is logged, not silently discarded — see the caller,
 * which surfaces the failed count.
 */
export const stopThreadDescendants = (input: {
  readonly threadId: string;
  readonly triggerEventId: string;
  readonly createdAt: string;
  readonly byUser: boolean;
  readonly dispatch: OrchestrationEngineShape["dispatch"];
}): Effect.Effect<
  { readonly attempted: number; readonly failed: number },
  never,
  SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const descendants = yield* loadT3TeamThreadDescendants(input.threadId);
    let failed = 0;
    yield* Effect.forEach(
      descendants,
      (descendantThreadId) =>
        input
          .dispatch({
            type: "thread.turn.interrupt",
            commandId: CommandId.make(
              `t3team-cascade-stop:${input.triggerEventId}:${descendantThreadId}`,
            ),
            threadId: ThreadId.make(descendantThreadId),
            t3teamStopOrigin: input.byUser ? "user" : "system",
            createdAt: input.createdAt,
          })
          .pipe(
            Effect.catchCause((cause) => {
              failed++;
              return Effect.logWarning(
                "t3team cascade stop failed to interrupt a descendant thread",
                { rootThreadId: input.threadId, descendantThreadId, cause: Cause.pretty(cause) },
              );
            }),
          ),
      { concurrency: 1 },
    );
    return { attempted: descendants.length, failed };
  });
