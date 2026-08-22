import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { type T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, okResult } from "./t3team-toolBrokerHelpers.ts";

/**
 * `t3team.thread.search_source` — search the FULL transcript of the thread the
 * current thread was forked from. The fork provenance note (a system message
 * carrying `t3teamExt.forkSource`) identifies the source thread; this tool
 * makes the omitted middle of a truncated fork reachable again.
 */

const SEARCH_SOURCE_TOOL_ID = "t3team.thread.search_source";
const DEFAULT_MATCH_LIMIT = 10;
const MAX_MATCH_LIMIT = 25;
const SNIPPET_RADIUS_CHARS = 200;

type SearchSourceThreadMessage = {
  readonly id: string;
  readonly role: string;
  readonly text?: string | null | undefined;
  readonly createdAt?: string | undefined;
  readonly t3teamExt?:
    | { readonly forkSource?: { readonly threadId: string } | undefined }
    | null
    | undefined;
};

export type SearchSourceThreadDetail = {
  readonly title?: string | undefined;
  readonly messages: ReadonlyArray<SearchSourceThreadMessage>;
};

type SearchSourceArgs = {
  readonly query?: unknown;
  readonly limit?: unknown;
};

function buildSnippet(text: string, queryLower: string): string {
  const index = text.toLowerCase().indexOf(queryLower);
  const start = Math.max(0, index - SNIPPET_RADIUS_CHARS);
  const end = Math.min(text.length, index + queryLower.length + SNIPPET_RADIUS_CHARS);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

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
      errorResult(`${SEARCH_SOURCE_TOOL_ID} requires a non-empty 'query' string.`),
    );
  }
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.min(Math.max(Math.floor(args.limit), 1), MAX_MATCH_LIMIT)
      : DEFAULT_MATCH_LIMIT;

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

    // A fork of a fork carries the parent's older provenance note in its head
    // plus its own newer one; the most recent note identifies the direct
    // source whose omitted middle this tool exists to reach.
    const notes = currentThread.messages.filter(
      (message) => message.t3teamExt?.forkSource?.threadId,
    );
    const note = notes[notes.length - 1];
    if (!note?.t3teamExt?.forkSource?.threadId) {
      return errorResult(
        "This thread has no fork source. " +
          `${SEARCH_SOURCE_TOOL_ID} only works in a thread that was forked from another thread.`,
      );
    }
    const sourceThreadId = ThreadId.make(note.t3teamExt.forkSource.threadId);

    const sourceRead = yield* loadThreadDetail(sourceThreadId).pipe(Effect.result);
    if (sourceRead._tag === "Failure") {
      return errorResult(`Could not read the fork source thread: ${sourceRead.failure}`);
    }
    const sourceThread = sourceRead.success;
    if (!sourceThread) {
      return errorResult("The original (fork source) thread is no longer available.");
    }

    const queryLower = query.toLowerCase();
    const matches: Array<{
      readonly index: number;
      readonly role: string;
      readonly createdAt?: string;
      readonly snippet: string;
    }> = [];
    let totalMatches = 0;
    for (const [index, message] of sourceThread.messages.entries()) {
      const text = message.text ?? "";
      if (!text.toLowerCase().includes(queryLower)) continue;
      totalMatches += 1;
      if (matches.length < limit) {
        matches.push({
          index: index + 1,
          role: message.role,
          ...(message.createdAt ? { createdAt: message.createdAt } : {}),
          snippet: buildSnippet(text, queryLower),
        });
      }
    }

    return okResult({
      ok: true,
      sourceThreadId: note.t3teamExt.forkSource.threadId,
      ...(sourceThread.title ? { sourceThreadTitle: sourceThread.title } : {}),
      totalMatches,
      returnedMatches: matches.length,
      matches,
      ...(totalMatches === 0
        ? {
            hint: `No message in the original thread contains "${query}". Try a shorter or different term.`,
          }
        : {}),
    });
  });
}
