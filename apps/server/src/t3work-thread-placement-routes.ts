import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody, toAtlassianError } from "./t3work-atlassian-http.ts";
import type { T3workTurnToolContext } from "./t3work-toolBroker.ts";
import { readTicketIdFromThreadToolContext } from "./t3work-toolBrokerStartChildToolContext.ts";
import { T3workThreadToolContextStore } from "./t3work-threadToolContextStore.ts";

type T3workThreadPlacement = {
  readonly threadId: string;
  readonly parentThreadId?: string;
  readonly ticketId?: string;
};

type T3workThreadPlacementRequest = {
  readonly threadIds?: ReadonlyArray<string>;
};

type T3workThreadPlacementRow = {
  readonly parentThreadId: string | null;
  readonly ticketId: string | null;
};

function readRequestedThreadIds(value: ReadonlyArray<string> | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
}

export function resolveT3workThreadPlacement(input: {
  readonly threadId: string;
  readonly retention?: "ephemeral" | "retained" | null;
  readonly row: T3workThreadPlacementRow | null | undefined;
  readonly toolContext: T3workTurnToolContext | undefined;
}): T3workThreadPlacement | null {
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
  } satisfies T3workThreadPlacement;
}

function loadT3workThreadPlacements(
  threadIds: ReadonlyArray<string>,
): Effect.Effect<
  ReadonlyArray<T3workThreadPlacement>,
  Error,
  SqlClient.SqlClient | T3workThreadToolContextStore
> {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const toolContextStore = yield* T3workThreadToolContextStore;
    const placements = yield* Effect.forEach(threadIds, (threadId) =>
      Effect.gen(function* () {
        const threadRows = yield* sql<{ readonly retention: "ephemeral" | "retained" | null }>`
          SELECT retention
          FROM projection_threads
          WHERE thread_id = ${threadId}
            AND deleted_at IS NULL
          LIMIT 1
        `;
        const rows = yield* sql<T3workThreadPlacementRow>`
          SELECT
            COALESCE(
              (
                SELECT NULLIF(TRIM(CAST(json_extract(payload_json, '$.parentThreadId') AS TEXT)), '')
                FROM projection_thread_activities
                WHERE thread_id = ${threadId} AND kind = 't3work.handoff.created'
                ORDER BY created_at DESC, activity_id DESC LIMIT 1
              ),
              (
                SELECT thread_id FROM projection_thread_activities
                WHERE kind = 't3work.handoff.started'
                  AND json_extract(payload_json, '$.childThreadId') = ${threadId}
                ORDER BY created_at DESC, activity_id DESC LIMIT 1
              )
            ) AS "parentThreadId",
            (
              SELECT NULLIF(TRIM(CAST(json_extract(payload_json, '$.ticketId') AS TEXT)), '')
              FROM projection_thread_activities
              WHERE thread_id = ${threadId} AND kind = 't3work.handoff.created'
              ORDER BY created_at DESC, activity_id DESC LIMIT 1
            ) AS "ticketId"
        `;

        const toolContext = yield* toolContextStore.get(ThreadId.make(threadId));
        const retention = threadRows[0]?.retention;
        return resolveT3workThreadPlacement({
          threadId,
          ...(retention === undefined ? {} : { retention }),
          row: rows[0],
          toolContext,
        });
      }),
    );

    return placements.filter((placement): placement is T3workThreadPlacement => placement !== null);
  });
}

export const t3workThreadPlacementRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/thread/placements",
  Effect.gen(function* () {
    const input = yield* readJsonBody<T3workThreadPlacementRequest>();
    const threadIds = readRequestedThreadIds(input.threadIds);
    const placements = threadIds.length === 0 ? [] : yield* loadT3workThreadPlacements(threadIds);
    return okJson({ placements });
  }).pipe(
    Effect.mapError(toAtlassianError("Failed to load thread placement metadata.")),
    Effect.catch(errorResponse),
  ),
);
