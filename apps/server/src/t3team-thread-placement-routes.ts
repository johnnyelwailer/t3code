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

// SQLite's bound-parameter ceiling is 999 on older builds; stay well under it.
const THREAD_ID_CHUNK_SIZE = 400;

function chunkThreadIds(threadIds: ReadonlyArray<string>): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < threadIds.length; index += THREAD_ID_CHUNK_SIZE) {
    chunks.push(threadIds.slice(index, index + THREAD_ID_CHUNK_SIZE));
  }
  return chunks;
}

function normalizeJsonText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type HandoffCreatedRow = {
  readonly threadId: string;
  readonly parentThreadId: string | null;
  readonly ticketId: string | null;
};

type HandoffStartedRow = {
  readonly threadId: string;
  readonly childThreadId: string | null;
};

/**
 * Batched placement lookup (GHE #382).
 *
 * The previous shape issued two statements per requested thread, one of them an
 * unindexed scan of `projection_thread_activities`. With ~170 candidate ids per
 * request and ~86k activities that took 11–13 s of synchronous SQLite on the
 * event loop, which starved the desktop readiness probe. This runs three
 * set-based statements per chunk and reduces in memory.
 */
export function loadT3TeamThreadPlacements(
  threadIds: ReadonlyArray<string>,
): Effect.Effect<
  ReadonlyArray<T3TeamThreadPlacement>,
  Error,
  SqlClient.SqlClient | T3TeamThreadToolContextStore
> {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const toolContextStore = yield* T3TeamThreadToolContextStore;

    const retentionByThread = new Map<string, "ephemeral" | "retained" | null>();
    // Newest `handoff.created` row per child thread.
    const createdByThread = new Map<string, HandoffCreatedRow>();
    // Newest `handoff.started` row per child thread (parent = row.threadId).
    const startedParentByChild = new Map<string, string>();
    const requested = new Set(threadIds);

    for (const chunk of chunkThreadIds(threadIds)) {
      const threadRows = yield* sql<{
        readonly threadId: string;
        readonly retention: "ephemeral" | "retained" | null;
      }>`
        SELECT thread_id AS "threadId", retention
        FROM projection_threads
        WHERE deleted_at IS NULL
          AND ${sql.in("thread_id", chunk)}
      `;
      for (const row of threadRows) {
        retentionByThread.set(row.threadId, row.retention);
      }

      const createdRows = yield* sql<HandoffCreatedRow>`
        SELECT
          thread_id AS "threadId",
          CAST(json_extract(payload_json, '$.parentThreadId') AS TEXT) AS "parentThreadId",
          CAST(json_extract(payload_json, '$.ticketId') AS TEXT) AS "ticketId"
        FROM projection_thread_activities
        WHERE kind = 't3team.handoff.created'
          AND ${sql.in("thread_id", chunk)}
        ORDER BY created_at DESC, activity_id DESC
      `;
      for (const row of createdRows) {
        if (!createdByThread.has(row.threadId)) {
          createdByThread.set(row.threadId, row);
        }
      }
    }

    // `handoff.started` is keyed by the parent, so filter on the child id in
    // memory. The kind index keeps this to the handful of handoff rows.
    const startedRows = yield* sql<HandoffStartedRow>`
      SELECT
        thread_id AS "threadId",
        CAST(json_extract(payload_json, '$.childThreadId') AS TEXT) AS "childThreadId"
      FROM projection_thread_activities
      WHERE kind = 't3team.handoff.started'
      ORDER BY created_at DESC, activity_id DESC
    `;
    for (const row of startedRows) {
      const childThreadId = normalizeJsonText(row.childThreadId);
      if (
        childThreadId !== null &&
        requested.has(childThreadId) &&
        !startedParentByChild.has(childThreadId)
      ) {
        startedParentByChild.set(childThreadId, row.threadId);
      }
    }

    const placements = yield* Effect.forEach(threadIds, (threadId) =>
      Effect.gen(function* () {
        const created = createdByThread.get(threadId);
        const parentThreadId =
          normalizeJsonText(created?.parentThreadId) ?? startedParentByChild.get(threadId) ?? null;
        const ticketId = normalizeJsonText(created?.ticketId);
        const row: T3TeamThreadPlacementRow | null =
          parentThreadId === null && ticketId === null ? null : { parentThreadId, ticketId };

        const toolContext = yield* toolContextStore.get(ThreadId.make(threadId));
        const retention = retentionByThread.get(threadId);
        return resolveT3TeamThreadPlacement({
          threadId,
          ...(retention === undefined ? {} : { retention }),
          row,
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
