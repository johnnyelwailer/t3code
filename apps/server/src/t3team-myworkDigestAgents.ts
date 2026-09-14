/**
 * The claim's "who is on it" label: "<Provider> · <model>".
 *
 * The primary source is what the thread already stores — `projection_threads.model`
 * plus `projection_thread_sessions.provider_name` — formatted with the same
 * display names the sidebar uses. The message-id-prefix inference the client
 * does (threadBridge) is the last resort for threads whose session row predates
 * provider capture.
 */

import { localProviderDisplayName } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

type ThreadAgentRow = {
  readonly threadId: string;
  readonly model: string;
  readonly providerName: string | null;
};

/** Stored per-thread provider + model for the given threads. */
export function readDigestThreadAgentRows(threadIds: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    if (threadIds.length === 0) return [] as ThreadAgentRow[];
    const sql = yield* SqlClient.SqlClient;
    return yield* sql<ThreadAgentRow>`
      SELECT t.thread_id AS "threadId", t.model AS "model", s.provider_name AS "providerName"
      FROM projection_threads t
      LEFT JOIN projection_thread_sessions s ON s.thread_id = t.thread_id
      WHERE ${sql.in("t.thread_id", threadIds)}
    `;
  });
}

/**
 * The last-resort inference, straight from the message-id prefix
 * (`local:codex:…` / `local:claudeAgent:…`) — the same rule the client uses.
 */
export function inferDigestThreadAgents(threadIds: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    if (threadIds.length === 0) return new Map<string, string>();
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly threadId: string; readonly firstMessageId: string | null }>`
      SELECT m.thread_id AS "threadId", MIN(m.message_id) AS "firstMessageId"
      FROM projection_thread_messages m
      WHERE ${sql.in("m.thread_id", threadIds)}
      GROUP BY m.thread_id
    `;
    const agents = new Map<string, string>();
    for (const row of rows) {
      if (row.firstMessageId === null) continue;
      const agent = row.firstMessageId.startsWith("local:codex:")
        ? "codex"
        : row.firstMessageId.startsWith("local:claudeAgent:")
          ? "claude"
          : "agent";
      agents.set(row.threadId, agent);
    }
    return agents;
  });
}

/**
 * The one display label for a claim's thread: "<Provider> · <model>".
 * Stored provider wins; the inferred one (message-id prefix) is the fallback.
 */
export function digestAgentLabel(input: {
  readonly providerName?: string | null;
  readonly model: string;
  readonly inferredProvider?: string;
}): string {
  const stored = input.providerName?.trim();
  const provider =
    stored !== undefined && stored !== "" ? stored : (input.inferredProvider ?? "agent");
  const display = localProviderDisplayName(provider);
  const model = input.model.trim();
  return model !== "" ? `${display} · ${model}` : display;
}

/**
 * One display label per thread. Stored provider/model wins; the message-id
 * inference fills in only where the session row has no provider yet.
 */
export function readDigestThreadAgents(threadIds: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    if (threadIds.length === 0) return new Map<string, string>();
    const rows = yield* readDigestThreadAgentRows(threadIds);
    const missing = rows
      .filter((row) => row.providerName === null || row.providerName.trim() === "")
      .map((row) => row.threadId);
    const inferred =
      missing.length > 0 ? yield* inferDigestThreadAgents(missing) : new Map<string, string>();
    const agents = new Map<string, string>();
    for (const row of rows) {
      const inferredProvider = inferred.get(row.threadId);
      agents.set(
        row.threadId,
        digestAgentLabel({
          providerName: row.providerName,
          model: row.model,
          ...(inferredProvider !== undefined ? { inferredProvider } : {}),
        }),
      );
    }
    return agents;
  });
}
