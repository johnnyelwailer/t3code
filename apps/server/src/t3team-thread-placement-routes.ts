import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody, toAtlassianError } from "./t3team-atlassian-http.ts";
import type { T3TeamTurnToolContext } from "./t3team-toolBroker.ts";
import { readTicketIdFromThreadToolContext } from "./t3team-toolBrokerStartChildToolContext.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";

type T3TeamThreadPlacement = {
  readonly threadId: string;
  readonly parentThreadId?: string;
  readonly ticketId?: string;
};

type T3TeamThreadPlacementRequest = {
  readonly threadIds?: ReadonlyArray<string>;
};

type T3TeamThreadPlacementRow = {
  readonly parentThreadId: string | null;
  readonly ticketId: string | null;
};

function readRequestedThreadIds(value: ReadonlyArray<string> | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
}

export function resolveT3TeamThreadPlacement(input: {
  readonly threadId: string;
  readonly retention?: "ephemeral" | "retained" | null;
  readonly row: T3TeamThreadPlacementRow | null | undefined;
  readonly toolContext: T3TeamTurnToolContext | undefined;
}): T3TeamThreadPlacement | null {
  // Placement metadata can outlive a workflow child. It must never revive an
  // ephemeral thread in either project or Local workspaces navigation.
  if (input.retention === "ephemeral") {
    return null;
  }
  const ticketId = input.row?.ticketId ?? readTicketIdFromThreadToolContext(input.toolContext);

  if (!input.row?.parentThreadId && !ticketId) {
    return null;
  }

  return {
    threadId: input.threadId,
    ...(input.row?.parentThreadId ? { parentThreadId: input.row.parentThreadId } : {}),
    ...(ticketId ? { ticketId } : {}),
  } satisfies T3TeamThreadPlacement;
}

function loadT3TeamThreadPlacements(
  threadIds: ReadonlyArray<string>,
): Effect.Effect<
  ReadonlyArray<T3TeamThreadPlacement>,
  Error,
  SqlClient.SqlClient | T3TeamThreadToolContextStore
> {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const toolContextStore = yield* T3TeamThreadToolContextStore;
    const placements = yield* Effect.forEach(threadIds, (threadId) =>
      Effect.gen(function* () {
        const threadRows = yield* sql<{ readonly retention: "ephemeral" | "retained" | null }>`
          SELECT retention
          FROM projection_threads
          WHERE thread_id = ${threadId}
            AND deleted_at IS NULL
          LIMIT 1
        `;
        const rows = yield* sql<T3TeamThreadPlacementRow>`
          SELECT
            COALESCE(
              (
                SELECT NULLIF(TRIM(CAST(json_extract(payload_json, '$.parentThreadId') AS TEXT)), '')
                FROM projection_thread_activities
                WHERE thread_id = ${threadId} AND kind = 't3team.handoff.created'
                ORDER BY created_at DESC, activity_id DESC LIMIT 1
              ),
              (
                SELECT thread_id FROM projection_thread_activities
                WHERE kind = 't3team.handoff.started'
                  AND json_extract(payload_json, '$.childThreadId') = ${threadId}
                ORDER BY created_at DESC, activity_id DESC LIMIT 1
              )
            ) AS "parentThreadId",
            (
              SELECT NULLIF(TRIM(CAST(json_extract(payload_json, '$.ticketId') AS TEXT)), '')
              FROM projection_thread_activities
              WHERE thread_id = ${threadId} AND kind = 't3team.handoff.created'
              ORDER BY created_at DESC, activity_id DESC LIMIT 1
            ) AS "ticketId"
        `;

        const toolContext = yield* toolContextStore.get(ThreadId.make(threadId));
        const retention = threadRows[0]?.retention;
        return resolveT3TeamThreadPlacement({
          threadId,
          ...(retention === undefined ? {} : { retention }),
          row: rows[0],
          toolContext,
        });
      }),
    );

    return placements.filter((placement): placement is T3TeamThreadPlacement => placement !== null);
  });
}

export const t3teamThreadPlacementRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/placements",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3TeamThreadPlacementRequest>();
    const threadIds = readRequestedThreadIds(input.threadIds);
    const placements = threadIds.length === 0 ? [] : yield* loadT3TeamThreadPlacements(threadIds);
    return okJson({ placements });
  }).pipe(
    Effect.mapError(toAtlassianError("Failed to load thread placement metadata.")),
    Effect.catch(errorResponse),
  ),
);
