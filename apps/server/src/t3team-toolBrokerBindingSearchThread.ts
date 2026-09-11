import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import {
  buildThreadSearchEntries,
  normalizeThreadSearchLimit,
  normalizeThreadSearchOffset,
  normalizeThreadSearchOrder,
  normalizeThreadSearchScope,
  searchThreadEntries,
  type ThreadMessageSearchableActivity,
  type ThreadMessageSearchableMessage,
} from "./t3team-threadMessageSearch.ts";

/**
 * `t3team.thread.search` — search the transcript of the CURRENT (bound)
 * thread: its messages and its tool activity (commands and their output, file
 * reads, tool calls). Read-only; complements `t3team.thread.search_source`
 * (the fork source thread) and `t3team.thread.read_message` (full body by
 * message id).
 */

const SEARCH_THREAD_TOOL_ID = "t3team.thread.search";

export type SearchThreadDetail = {
  readonly title?: string | undefined;
  readonly messages: ReadonlyArray<ThreadMessageSearchableMessage>;
  readonly activities?: ReadonlyArray<ThreadMessageSearchableActivity> | undefined;
};

type SearchThreadArgs = {
  readonly query?: unknown;
  readonly limit?: unknown;
  readonly offset?: unknown;
  readonly scope?: unknown;
  readonly order?: unknown;
  readonly role?: unknown;
};

export function callT3TeamSearchThreadTool(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly threadId?: ThreadId;
  readonly loadThreadDetail?: (
    threadId: ThreadId,
  ) => Effect.Effect<SearchThreadDetail | undefined, string>;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const { tool, toolArgs, threadId, loadThreadDetail } = input;
  if (!threadId || !loadThreadDetail) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
  }

  const args = (toolArgs ?? {}) as SearchThreadArgs;
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (query.length === 0) {
    return Effect.succeed(
      errorResult(`${SEARCH_THREAD_TOOL_ID} requires a non-empty 'query' string.`),
    );
  }
  const limit = normalizeThreadSearchLimit(args.limit);
  const offset = normalizeThreadSearchOffset(args.offset);
  const scope = normalizeThreadSearchScope(args.scope);
  const order = normalizeThreadSearchOrder(args.order);
  const role = typeof args.role === "string" && args.role.length > 0 ? args.role : undefined;

  return Effect.gen(function* () {
    const threadRead = yield* loadThreadDetail(threadId).pipe(Effect.result);
    if (threadRead._tag === "Failure") {
      return errorResult(`Could not read the current thread: ${threadRead.failure}`);
    }
    const thread = threadRead.success;
    if (!thread) {
      return errorResult("Could not read the current thread.");
    }

    const entries = buildThreadSearchEntries({
      messages: thread.messages,
      activities: thread.activities,
      scope,
    });
    const search = searchThreadEntries(entries, {
      query,
      limit,
      offset,
      order,
      ...(role ? { label: role } : {}),
    });

    return okResult({
      ok: true,
      scope,
      order,
      matchMode: search.matchMode,
      totalMatches: search.totalMatches,
      returnedMatches: search.returnedMatches,
      hasMore: search.hasMore,
      matches: search.matches.map(
        ({ position, role: matchRole, createdAt, messageId, snippet, source }) => ({
          position,
          source,
          role: matchRole,
          ...(createdAt ? { createdAt } : {}),
          // Only a message id is usable with `t3team.thread.read_message`.
          // An activity id under the same key would invite a lookup that
          // always fails, so activities report `activity_id` instead.
          ...(source === "message" ? { message_id: messageId } : { activity_id: messageId }),
          snippet,
        }),
      ),
      ...(search.hasMore
        ? {
            hint:
              `Showing matches ${offset + 1}-${offset + search.returnedMatches} of ` +
              `${search.totalMatches}. Pass offset: ${offset + search.returnedMatches} for the next page.`,
          }
        : {}),
      ...(search.totalMatches === 0
        ? {
            hint:
              `Nothing in this thread contains "${query}"` +
              `${scope === "all" ? "" : ` within scope '${scope}'`}. ` +
              "A multi-word query also retried as all-terms and found nothing — try one distinctive word, " +
              "or scope: 'activities' to search command output and tool calls.",
          }
        : {}),
    });
  });
}
