import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";
import {
  normalizeThreadSearchLimit,
  searchThreadMessages,
} from "./t3team-threadMessageSearch.ts";

/**
 * `t3team.thread.search` — search the transcript of the CURRENT (bound)
 * thread. Read-only; complements `t3team.thread.search_source` (the fork
 * source thread) and `t3team.thread.read_message` (full body by message id).
 */

const SEARCH_THREAD_TOOL_ID = "t3team.thread.search";

type SearchThreadMessage = {
  readonly id: string;
  readonly role: string;
  readonly text?: string | null | undefined;
  readonly createdAt?: string | undefined;
};

export type SearchThreadDetail = {
  readonly title?: string | undefined;
  readonly messages: ReadonlyArray<SearchThreadMessage>;
};

type SearchThreadArgs = {
  readonly query?: unknown;
  readonly limit?: unknown;
  readonly role?: unknown;
};

const ROLE_FILTERS = ["user", "assistant", "actor"] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];

function readRoleFilter(value: unknown): RoleFilter | undefined {
  if (value === "user" || value === "assistant" || value === "actor") return value;
  return undefined;
}

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
  const role = readRoleFilter(args.role);

  return Effect.gen(function* () {
    const threadRead = yield* loadThreadDetail(threadId).pipe(Effect.result);
    if (threadRead._tag === "Failure") {
      return errorResult(`Could not read the current thread: ${threadRead.failure}`);
    }
    const thread = threadRead.success;
    if (!thread) {
      return errorResult("Could not read the current thread.");
    }

    const search = searchThreadMessages(thread.messages, {
      query,
      limit,
      ...(role ? { role } : {}),
    });

    return okResult({
      ok: true,
      totalMatches: search.totalMatches,
      returnedMatches: search.returnedMatches,
      matches: search.matches.map(({ position, role: matchRole, createdAt, messageId, snippet }) => ({
        position,
        role: matchRole,
        ...(createdAt ? { createdAt } : {}),
        message_id: messageId,
        snippet,
      })),
      ...(search.totalMatches === 0
        ? {
            hint: `No message in this thread contains "${query}". Try a shorter or different term.`,
          }
        : {}),
    });
  });
}
