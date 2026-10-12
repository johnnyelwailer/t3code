import type { ExternalResourceRef } from "@t3tools/project-context";
import type { ComposerReferenceRecency } from "@t3tools/shared/composerReferenceRank";

import { createAtlassianBackendApi } from "./backend/t3team-atlassianBackendApi";
import type { AtlassianBacklogSearchInput } from "./backend/t3team-atlassianBackendTypes";

/**
 * Composer reference-recency + work-item search (U2), client-side.
 *
 * Recency is a session-scoped in-memory log that feeds the shared smart ranker's
 * "referenced in this thread" / "last-used" / "use-count" signals for the work-item menu. It is
 * deliberately not durable (no server table, no new WS RPC): the server's WebSocket RPC group is
 * already at TypeScript's type-instantiation ceiling, so any added WS method breaks the whole
 * server build. Work-item search reuses the existing t3team Atlassian backlog-search HTTP endpoint
 * rather than adding a new RPC.
 */
type ComposerReferenceKind = "work-item" | "pull-request";

export const EMPTY_COMPOSER_WORK_ITEM_RECENCY: ComposerReferenceRecency = {
  lastUsedAt: null,
  useCount: 0,
  referencedInThread: false,
};

// ---------------------------------------------------------------------------
// In-memory, session-scoped recency log
// ---------------------------------------------------------------------------
type RecencyEntry = { readonly lastUsedAt: number; readonly useCount: number };
const recencyLog = new Map<string, Map<string, RecencyEntry>>();
const bucketKey = (threadId: string, kind: ComposerReferenceKind) =>
  `${threadId}\u0000${kind}`;

/** Record that the user referenced `refId` in this thread just now. */
export function recordComposerReferenceRecency(
  threadId: string,
  kind: ComposerReferenceKind,
  refId: string,
): void {
  if (threadId.length === 0 || refId.length === 0) return;
  const key = bucketKey(threadId, kind);
  const bucket = recencyLog.get(key) ?? new Map<string, RecencyEntry>();
  const previous = bucket.get(refId);
  bucket.set(refId, { lastUsedAt: Date.now(), useCount: (previous?.useCount ?? 0) + 1 });
  recencyLog.set(key, bucket);
}

/** Recency signals for a bounded set of reference ids, scoped to one thread. */
export function readComposerReferenceRecency(
  threadId: string,
  kind: ComposerReferenceKind,
  refIds: ReadonlyArray<string>,
): Record<string, ComposerReferenceRecency> {
  const bucket = recencyLog.get(bucketKey(threadId, kind));
  const out: Record<string, ComposerReferenceRecency> = {};
  for (const refId of refIds) {
    const entry = bucket?.get(refId);
    out[refId] =
      entry === undefined
        ? EMPTY_COMPOSER_WORK_ITEM_RECENCY
        : { lastUsedAt: entry.lastUsedAt, useCount: entry.useCount, referencedInThread: true };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Work-item search: reuse the existing t3team Atlassian backlog-search endpoint
// ---------------------------------------------------------------------------
export interface ComposerWorkItem {
  readonly key: string;
  readonly jiraProjectKey: string;
  readonly title: string;
  readonly status: string;
  readonly url: string;
  readonly capturedAt: string;
  readonly recency: ComposerReferenceRecency;
}

function projectPrefixFromKey(key: string): string {
  const dash = key.indexOf("-");
  return dash > 0 ? key.slice(0, dash) : key;
}

export async function searchComposerWorkItems(
  httpBaseUrl: string,
  input: {
    readonly account: { readonly id: string; readonly provider: string };
    readonly externalProjectId: string;
    readonly jiraProjectKey?: string;
    readonly query: string;
    readonly threadId: string;
    readonly limit?: number;
  },
): Promise<ReadonlyArray<ComposerWorkItem>> {
  const request: AtlassianBacklogSearchInput = {
    account: input.account,
    externalProjectId: input.externalProjectId,
    query: input.query,
    mode: "live",
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  };
  const api = createAtlassianBackendApi(httpBaseUrl);
  if (api.searchBacklog === undefined) {
    throw new Error("The work-item search backend is not available.");
  }
  const result = await api.searchBacklog(request);
  const items: ReadonlyArray<ExternalResourceRef> = result.items;
  const recency = readComposerReferenceRecency(
    input.threadId,
    "work-item",
    items.map((item) => item.displayId ?? item.id),
  );
  const nowIso = new Date().toISOString();
  return items.map((item) => {
    const key = item.displayId ?? item.id;
    return {
      key,
      jiraProjectKey: input.jiraProjectKey ?? projectPrefixFromKey(key),
      title: item.title,
      status: item.status ?? "",
      url: item.url ?? "",
      capturedAt: item.updatedAt ?? nowIso,
      recency: recency[key] ?? EMPTY_COMPOSER_WORK_ITEM_RECENCY,
    };
  });
}

