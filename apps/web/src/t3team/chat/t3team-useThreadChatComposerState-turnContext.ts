import type { BackendApi } from "~/t3team/backend/t3team-types";
import type { T3TeamTurnToolContext } from "~/t3team/t3team-threadToolContext";

/**
 * Last tool context successfully synced to the server, per thread. The context is stable across
 * consecutive sends in a thread (static tool catalog + thread/project view metadata), so re-POSTing
 * the same value on every send was pure round-trip latency. The server keeps the stored context as
 * the fallback for tool binding, so an unchanged value needs no re-sync. A failed sync is not
 * cached, so the next send retries. Known trade-off: after a SERVER restart the in-memory store is
 * empty but the cache is not, so a thread stays on its last-known (now default) context until the
 * context actually changes — acceptable, since the server falls back to the generic tool surface.
 */
const lastSyncedToolContextByThread = new Map<string, string>();

function syncKeyFor(toolContext: T3TeamTurnToolContext | null): string {
  return JSON.stringify(toolContext);
}

export async function syncThreadToolContextCached(
  backend: BackendApi,
  threadId: string,
  toolContext: T3TeamTurnToolContext | null,
): Promise<void> {
  const key = syncKeyFor(toolContext);
  if (lastSyncedToolContextByThread.get(threadId) === key) {
    return; // server already has exactly this context for this thread
  }

  await backend.syncThreadToolContext({
    threadId,
    toolContext,
  });
  lastSyncedToolContextByThread.set(threadId, key);
}
