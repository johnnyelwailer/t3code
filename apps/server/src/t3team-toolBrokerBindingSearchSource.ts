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
import { mcpToolNameOf } from "./t3team-mcpCanonicalToolMap.ts";

/**
 * `t3team.thread.search_source` — search the FULL transcript (messages and tool
 * activity) of the thread the current thread was forked from. The source is the
 * fork's V2 lineage parent; a fork starts from a compacted handoff of it, so
 * this keeps the source's details reachable.
 */

const SEARCH_SOURCE_TOOL_ID = "t3team.thread.search_source";

export type SearchSourceThreadDetail = {
  readonly title?: string | undefined;
  readonly messages: ReadonlyArray<ThreadMessageSearchableMessage>;
  readonly activities?: ReadonlyArray<ThreadMessageSearchableActivity> | undefined;
  /** The thread this one was forked from; null when it is not a fork. */
  readonly forkSourceThreadId: string | null;
};

type SearchSourceArgs = {
  readonly query?: unknown;
  readonly limit?: unknown;
  readonly offset?: unknown;
  readonly scope?: unknown;
  readonly order?: unknown;
};

export function callT3TeamSearchSourceTool(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly threadId?: ThreadId;
  readonly loadThreadDetail?: (
    threadId: ThreadId,
  ) => Effect.Effect<SearchSourceThreadDetail | undefined, string>;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const { tool, toolArgs, threadId, loadThreadDetail } = input;
  if (!threadId || !loadThreadDetail) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
  }

  const args = (toolArgs ?? {}) as SearchSourceArgs;
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (query.length === 0) {
    return Effect.succeed(
      errorResult(`${mcpToolNameOf(SEARCH_SOURCE_TOOL_ID)} requires a non-empty 'query' string.`),
    );
  }
  const limit = normalizeThreadSearchLimit(args.limit);
  const offset = normalizeThreadSearchOffset(args.offset);
  const scope = normalizeThreadSearchScope(args.scope);
  const order = normalizeThreadSearchOrder(args.order);

  return Effect.gen(function* () {
    const currentRead = yield* loadThreadDetail(threadId).pipe(Effect.result);
    if (currentRead._tag === "Failure") {
      return errorResult(
        `Could not read the current thread to find its fork source: ${currentRead.failure}`,
      );
    }
    const currentThread = currentRead.success;
    if (!currentThread) {
      return errorResult("Could not read the current thread to find its fork source.");
    }

    if (currentThread.forkSourceThreadId === null) {
      return errorResult(
        "This thread has no fork source. " +
          `${mcpToolNameOf(SEARCH_SOURCE_TOOL_ID)} only works in a thread that was forked from another thread.`,
      );
    }
    const sourceThreadId = ThreadId.make(currentThread.forkSourceThreadId);

    const sourceRead = yield* loadThreadDetail(sourceThreadId).pipe(Effect.result);
    if (sourceRead._tag === "Failure") {
      return errorResult(`Could not read the fork source thread: ${sourceRead.failure}`);
    }
    const sourceThread = sourceRead.success;
    if (!sourceThread) {
      return errorResult("The original (fork source) thread is no longer available.");
    }

    const entries = buildThreadSearchEntries({
      messages: sourceThread.messages,
      activities: sourceThread.activities,
      scope,
    });
    const search = searchThreadEntries(entries, { query, limit, offset, order });

    return okResult({
      ok: true,
      sourceThreadId,
      ...(sourceThread.title ? { sourceThreadTitle: sourceThread.title } : {}),
      scope,
      order,
      matchMode: search.matchMode,
      totalMatches: search.totalMatches,
      returnedMatches: search.returnedMatches,
      hasMore: search.hasMore,
      matches: search.matches.map(({ position, role, createdAt, messageId, snippet, source }) => ({
        position,
        source,
        role,
        ...(createdAt ? { createdAt } : {}),
        ...(source === "message" ? { message_id: messageId } : { activity_id: messageId }),
        snippet,
      })),
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
              `Nothing in the original thread contains "${query}". A multi-word query also retried ` +
              "as all-terms and found nothing — try one distinctive word, or scope: 'activities' to " +
              "search command output and tool calls.",
          }
        : {}),
    });
  });
}
