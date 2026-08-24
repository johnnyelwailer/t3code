/**
 * Shared transcript-search primitives for the t3team thread search tools
 * (`t3team.thread.search` and `t3team.thread.search_source`): case-insensitive
 * substring scan over a thread's messages, snippet building, and limit
 * clamping. Callers keep their own result shapes (e.g. `search_source` reports
 * `index` and omits the message id; `search` reports `position` + `message_id`).
 */

export const T3TEAM_THREAD_SEARCH_DEFAULT_MATCH_LIMIT = 10;
export const T3TEAM_THREAD_SEARCH_MAX_MATCH_LIMIT = 25;
const SNIPPET_RADIUS_CHARS = 200;

export type ThreadMessageSearchableMessage = {
  readonly id: string;
  readonly role: string;
  readonly text?: string | null | undefined;
  readonly createdAt?: string | undefined;
};

export type ThreadMessageSearchMatch = {
  /** 1-based position of the message in the thread transcript. */
  readonly position: number;
  readonly role: string;
  readonly createdAt?: string;
  readonly messageId: string;
  readonly snippet: string;
};

export type ThreadMessageSearchResult = {
  readonly totalMatches: number;
  readonly returnedMatches: number;
  readonly matches: ThreadMessageSearchMatch[];
};

/** Clamp a raw `limit` argument: floor 1, cap 25, default 10 when not a finite number. */
export function normalizeThreadSearchLimit(limit: unknown): number {
  return typeof limit === "number" && Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), T3TEAM_THREAD_SEARCH_MAX_MATCH_LIMIT)
    : T3TEAM_THREAD_SEARCH_DEFAULT_MATCH_LIMIT;
}

export function buildThreadSearchSnippet(text: string, queryLower: string): string {
  const index = text.toLowerCase().indexOf(queryLower);
  const start = Math.max(0, index - SNIPPET_RADIUS_CHARS);
  const end = Math.min(text.length, index + queryLower.length + SNIPPET_RADIUS_CHARS);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

/**
 * Case-insensitive substring scan over a thread's messages. `query` must be
 * non-empty (already trimmed by the caller); `limit` must already be clamped
 * via `normalizeThreadSearchLimit`. `role`, when given, restricts the scan to
 * messages of that role (and to those messages for `totalMatches`).
 */
export function searchThreadMessages(
  messages: ReadonlyArray<ThreadMessageSearchableMessage>,
  input: {
    readonly query: string;
    readonly limit: number;
    readonly role?: string | undefined;
  },
): ThreadMessageSearchResult {
  const queryLower = input.query.toLowerCase();
  const matches: ThreadMessageSearchMatch[] = [];
  let totalMatches = 0;
  for (const [index, message] of messages.entries()) {
    if (input.role && message.role !== input.role) continue;
    const text = message.text ?? "";
    if (!text.toLowerCase().includes(queryLower)) continue;
    totalMatches += 1;
    if (matches.length < input.limit) {
      matches.push({
        position: index + 1,
        role: message.role,
        ...(message.createdAt ? { createdAt: message.createdAt } : {}),
        messageId: message.id,
        snippet: buildThreadSearchSnippet(text, queryLower),
      });
    }
  }
  return { totalMatches, returnedMatches: matches.length, matches };
}
