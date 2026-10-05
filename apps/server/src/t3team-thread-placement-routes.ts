/**
 * Ticket and visible placement of threads for the t3team sidebar
 * (`POST /api/t3team/thread/placements {threadIds}` → `{placements}`).
 *
 * The parent/child relation itself is V2 lineage (`shell.lineage`), which every
 * client already has on the shell. This route only serves what lineage cannot:
 * the work item (ticket) a thread belongs to — from the delegated-child metadata
 * table or, for threads started from a ticket, the synced tool context — and the
 * visible placement parent when a child is shown under a thread other than its
 * lineage parent (`placementThreadId`, e.g. children of a hidden workflow helper).
 */
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import { errorResponse, okJson, readJsonBody, toAtlassianError } from "./t3team-atlassian-http.ts";
import { T3TeamChildThreadMetadata } from "./t3team-childThreadMetadata.ts";
import type { T3TeamTurnToolContext } from "./t3team-toolBroker.ts";
import { readTicketIdFromThreadToolContext } from "./t3team-toolBrokerStartChildToolContext.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";

type T3TeamThreadPlacement = {
  readonly threadId: string;
  readonly parentThreadId?: string;
  readonly ticketId?: string;
};

type T3TeamThreadPlacementRow = {
  readonly parentThreadId: string | null;
  readonly ticketId: string | null;
};

function readRequestedThreadIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return [...new Set(ids)];
}

export function resolveT3TeamThreadPlacement(input: {
  readonly threadId: string;
  readonly retention?: "ephemeral" | "retained" | null;
  readonly row: T3TeamThreadPlacementRow | null | undefined;
  readonly toolContext: T3TeamTurnToolContext | undefined;
}): T3TeamThreadPlacement | null {
  // Placement metadata can outlive a workflow child. It must never revive an
  // ephemeral thread in either project or Local workspaces navigation.
  if (input.retention === "ephemeral") return null;
  const ticketId = input.row?.ticketId ?? readTicketIdFromThreadToolContext(input.toolContext);
  if (!input.row?.parentThreadId && !ticketId) return null;
  return {
    threadId: input.threadId,
    ...(input.row?.parentThreadId ? { parentThreadId: input.row.parentThreadId } : {}),
    ...(ticketId ? { ticketId } : {}),
  };
}

// SQLite's bound-parameter ceiling is 999 on older builds; stay well under it.
const THREAD_ID_CHUNK_SIZE = 400;

const nonEmpty = (value: string | null | undefined): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

/** Batched: one metadata query per chunk, then per-thread primary-key / in-memory reads. */
export const loadT3TeamThreadPlacements = Effect.fn("t3team.threadPlacements.load")(function* (
  threadIds: ReadonlyArray<string>,
) {
  const metadata = yield* T3TeamChildThreadMetadata;
  const facts = yield* T3TeamThreadFactsStore;
  const toolContexts = yield* T3TeamThreadToolContextStore;

  const rowByThread = new Map<string, T3TeamThreadPlacementRow>();
  for (let index = 0; index < threadIds.length; index += THREAD_ID_CHUNK_SIZE) {
    const records = yield* metadata.listByChildThreadIds(
      threadIds.slice(index, index + THREAD_ID_CHUNK_SIZE),
    );
    for (const record of records) {
      rowByThread.set(record.childThreadId, {
        // The visible placement wins over the lineage parent it duplicates.
        parentThreadId: nonEmpty(record.placementThreadId) ?? nonEmpty(record.parentThreadId),
        ticketId: nonEmpty(record.ticketId),
      });
    }
  }

  const placements = yield* Effect.forEach(threadIds, (threadId) =>
    Effect.gen(function* () {
      const id = ThreadId.make(threadId);
      const threadFacts = yield* facts.get(id);
      const toolContext = yield* toolContexts.get(id);
      return resolveT3TeamThreadPlacement({
        threadId,
        retention: threadFacts?.retention ?? null,
        row: rowByThread.get(threadId) ?? null,
        toolContext,
      });
    }),
  );
  return placements.filter((placement): placement is T3TeamThreadPlacement => placement !== null);
});

export const t3teamThreadPlacementRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/placements",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly threadIds?: unknown }>();
    const threadIds = readRequestedThreadIds(input.threadIds);
    const placements = threadIds.length === 0 ? [] : yield* loadT3TeamThreadPlacements(threadIds);
    return okJson({ placements });
  }).pipe(
    Effect.mapError(toAtlassianError("Failed to load thread placement metadata.")),
    Effect.catch(errorResponse),
  ),
);
