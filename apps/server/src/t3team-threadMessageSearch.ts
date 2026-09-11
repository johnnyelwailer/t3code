/**
 * Transcript search for the t3team thread search tools
 * (`t3team.thread.search`, `t3team.thread.search_source`).
 *
 * A thread detail carries `messages` AND a sibling `activities` array — the
 * tool lifecycle: every bash command and its output, every file read, every
 * tool call. Both halves are searchable here. Searching messages alone covered
 * about half of a real transcript and excluded the half holding the evidence:
 * one 31-hour run had 1319 assistant messages against 677 command executions,
 * 544 tool calls and 29 file changes.
 *
 * Order defaults to `recent`. Matches are capped, so filling them in
 * transcript order returned the OLDEST — one real call reported
 * `totalMatches: 70, returnedMatches: 5`, the five earliest of seventy, which
 * is the opposite of what "what was last decided about X" needs.
 *
 * Matching is a case-insensitive substring. When the verbatim pass finds
 * nothing and the query has two or more terms, a second pass requires every
 * term somewhere in the entry and reports `matchMode: "all-terms"`. Verbatim
 * wins whenever it hits, so a literal query never changes meaning.
 */

export const T3TEAM_THREAD_SEARCH_DEFAULT_MATCH_LIMIT = 10;
export const T3TEAM_THREAD_SEARCH_MAX_MATCH_LIMIT = 25;
const SNIPPET_RADIUS_CHARS = 200;

/**
 * Cap on the text taken from one activity payload. Payloads are unbounded (a
 * read of a large file, a build log) and every search scans every entry, so an
 * uncapped stringify would scale search cost with the largest tool result in
 * the thread.
 */
const ACTIVITY_PAYLOAD_TEXT_CAP = 20_000;

export type ThreadMessageSearchableMessage = {
  readonly id: string;
  readonly role: string;
  readonly text?: string | null | undefined;
  readonly createdAt?: string | undefined;
};

/** `summary` is the short label ("bash", "read"); `payload` carries the detail. */
export type ThreadMessageSearchableActivity = {
  readonly id: string;
  readonly kind: string;
  readonly summary?: string | null | undefined;
  readonly payload?: unknown;
  readonly createdAt?: string | undefined;
};

export type ThreadSearchScope = "all" | "messages" | "activities";
export type ThreadSearchOrder = "recent" | "oldest";
export type ThreadSearchMatchMode = "verbatim" | "all-terms";

/**
 * One searchable unit, normalized across both streams. `position` is 1-based
 * WITHIN its own stream, so a message position still means its index among
 * messages and stays usable with `t3team.thread.read_message`.
 */
export type ThreadSearchEntry = {
  readonly id: string;
  readonly source: "message" | "activity";
  /** Role for a message, kind for an activity. */
  readonly label: string;
  readonly text: string;
  readonly createdAt?: string;
  readonly position: number;
};

export type ThreadMessageSearchMatch = {
  readonly position: number;
  readonly role: string;
  readonly createdAt?: string;
  readonly messageId: string;
  readonly snippet: string;
  readonly source: "message" | "activity";
};

export type ThreadMessageSearchResult = {
  readonly totalMatches: number;
  readonly returnedMatches: number;
  readonly matches: ThreadMessageSearchMatch[];
  readonly matchMode: ThreadSearchMatchMode;
  /** True when matches remain beyond `offset + limit` in the requested order. */
  readonly hasMore: boolean;
};

/** Clamp a raw `limit`: floor 1, cap 25, default 10 when not a finite number. */
export function normalizeThreadSearchLimit(limit: unknown): number {
  return typeof limit === "number" && Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), T3TEAM_THREAD_SEARCH_MAX_MATCH_LIMIT)
    : T3TEAM_THREAD_SEARCH_DEFAULT_MATCH_LIMIT;
}

/** Clamp a raw `offset`: floor 0, default 0 when not a finite number. */
export function normalizeThreadSearchOffset(offset: unknown): number {
  return typeof offset === "number" && Number.isFinite(offset)
    ? Math.max(Math.floor(offset), 0)
    : 0;
}

export function normalizeThreadSearchScope(scope: unknown): ThreadSearchScope {
  return scope === "messages" || scope === "activities" || scope === "all" ? scope : "all";
}

export function normalizeThreadSearchOrder(order: unknown): ThreadSearchOrder {
  return order === "oldest" || order === "recent" ? order : "recent";
}

export function buildThreadSearchSnippet(text: string, queryLower: string): string {
  const found = text.toLowerCase().indexOf(queryLower);
  // Exported helper: anchor at the start rather than slicing from a negative
  // index when the term is absent.
  const index = found < 0 ? 0 : found;
  const matchLength = found < 0 ? 0 : queryLower.length;
  const start = Math.max(0, index - SNIPPET_RADIUS_CHARS);
  const end = Math.min(text.length, index + matchLength + SNIPPET_RADIUS_CHARS);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function activityPayloadText(payload: unknown): string {
  if (payload === undefined || payload === null) return "";
  if (typeof payload === "string") return payload.slice(0, ACTIVITY_PAYLOAD_TEXT_CAP);
  try {
    return JSON.stringify(payload)?.slice(0, ACTIVITY_PAYLOAD_TEXT_CAP) ?? "";
  } catch {
    // A cyclic payload is skipped rather than failing the search.
    return "";
  }
}

/**
 * Interleave the two streams chronologically. Appending activities after
 * messages and then reversing for `recent` would rank every activity ahead of
 * every message regardless of when each happened: a match in yesterday's
 * command output would outrank one in a message from a minute ago. Entries
 * without a timestamp sort as oldest, and the sort is stable, so a stream with
 * no timestamps at all keeps its transcript order.
 */
function sortEntriesChronologically(entries: ThreadSearchEntry[]): ThreadSearchEntry[] {
  return entries
    .map((entry, index) => ({
      entry,
      index,
      time: entry.createdAt ? Date.parse(entry.createdAt) : 0,
    }))
    .sort((a, b) => {
      const left = Number.isNaN(a.time) ? 0 : a.time;
      const right = Number.isNaN(b.time) ? 0 : b.time;
      return left === right ? a.index - b.index : left - right;
    })
    .map(({ entry }) => entry);
}

/** Normalize a thread's streams into one chronologically ordered searchable list. */
export function buildThreadSearchEntries(input: {
  readonly messages?: ReadonlyArray<ThreadMessageSearchableMessage> | undefined;
  readonly activities?: ReadonlyArray<ThreadMessageSearchableActivity> | undefined;
  readonly scope: ThreadSearchScope;
}): ThreadSearchEntry[] {
  const entries: ThreadSearchEntry[] = [];
  if (input.scope !== "activities") {
    for (const [index, message] of (input.messages ?? []).entries()) {
      entries.push({
        id: message.id,
        source: "message",
        label: message.role,
        text: message.text ?? "",
        ...(message.createdAt ? { createdAt: message.createdAt } : {}),
        position: index + 1,
      });
    }
  }
  if (input.scope !== "messages") {
    for (const [index, activity] of (input.activities ?? []).entries()) {
      const summary = activity.summary ?? "";
      const payload = activityPayloadText(activity.payload);
      entries.push({
        id: activity.id,
        source: "activity",
        label: activity.kind,
        // The kind is searchable text so `query: "bash"` finds command
        // executions, matching what the agent sees in the UI.
        text: [activity.kind, summary, payload].filter((part) => part.length > 0).join("\n"),
        ...(activity.createdAt ? { createdAt: activity.createdAt } : {}),
        position: index + 1,
      });
    }
  }
  return sortEntriesChronologically(entries);
}

/**
 * Terms eligible for the all-terms fallback. One- and two-character terms are
 * dropped: as bare substrings they match inside unrelated words, so a query
 * like "a b" would match the literal text "bash" and fill a result page with
 * entries containing none of the query's actual words.
 */
const MIN_FALLBACK_TERM_LENGTH = 3;

function splitQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length >= MIN_FALLBACK_TERM_LENGTH);
}

function collectMatches(
  entries: ReadonlyArray<ThreadSearchEntry>,
  predicate: (textLower: string) => boolean,
  anchor: (textLower: string) => string,
  input: { readonly limit: number; readonly offset: number; readonly order: ThreadSearchOrder },
): { total: number; matches: ThreadMessageSearchMatch[] } {
  const ordered = input.order === "recent" ? [...entries].reverse() : entries;
  const matches: ThreadMessageSearchMatch[] = [];
  let total = 0;
  for (const entry of ordered) {
    const textLower = entry.text.toLowerCase();
    if (!predicate(textLower)) continue;
    total += 1;
    const rank = total - 1;
    if (rank < input.offset) continue;
    if (matches.length >= input.limit) continue;
    matches.push({
      position: entry.position,
      role: entry.label,
      ...(entry.createdAt ? { createdAt: entry.createdAt } : {}),
      messageId: entry.id,
      snippet: buildThreadSearchSnippet(entry.text, anchor(textLower)),
      source: entry.source,
    });
  }
  return { total, matches };
}

/**
 * Case-insensitive scan over normalized entries. `query` must be non-empty
 * (trimmed by the caller) and `limit` already clamped. `label`, when given,
 * restricts the scan to entries with that role/kind, and to those entries for
 * `totalMatches`.
 */
export function searchThreadEntries(
  entries: ReadonlyArray<ThreadSearchEntry>,
  input: {
    readonly query: string;
    readonly limit: number;
    readonly offset?: number | undefined;
    readonly order?: ThreadSearchOrder | undefined;
    readonly label?: string | undefined;
  },
): ThreadMessageSearchResult {
  const scoped = input.label ? entries.filter((entry) => entry.label === input.label) : entries;
  const offset = input.offset ?? 0;
  const order = input.order ?? "recent";
  const queryLower = input.query.toLowerCase();

  const verbatim = collectMatches(
    scoped,
    (textLower) => textLower.includes(queryLower),
    () => queryLower,
    { limit: input.limit, offset, order },
  );
  if (verbatim.total > 0) {
    return {
      totalMatches: verbatim.total,
      returnedMatches: verbatim.matches.length,
      matches: verbatim.matches,
      matchMode: "verbatim",
      hasMore: verbatim.total > offset + verbatim.matches.length,
    };
  }

  const terms = splitQueryTerms(input.query);
  if (terms.length < 2) {
    return {
      totalMatches: 0,
      returnedMatches: 0,
      matches: [],
      matchMode: "verbatim",
      hasMore: false,
    };
  }

  const allTerms = collectMatches(
    scoped,
    (textLower) => terms.every((term) => textLower.includes(term)),
    // Anchor the snippet on a term actually present, not the head of the entry.
    (textLower) => terms.find((term) => textLower.includes(term)) ?? terms[0]!,
    { limit: input.limit, offset, order },
  );
  return {
    totalMatches: allTerms.total,
    returnedMatches: allTerms.matches.length,
    matches: allTerms.matches,
    matchMode: "all-terms",
    hasMore: allTerms.total > offset + allTerms.matches.length,
  };
}
