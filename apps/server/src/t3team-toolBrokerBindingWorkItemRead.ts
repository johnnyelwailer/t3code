/**
 * Dispatch glue for `t3team.work_item.search` / `t3team.work_item.get`: argument decoding and the
 * answer shape. The work is in the handlers bound by `t3team-workItemReadLive.ts`, which see only
 * the calling thread's own project binding.
 */
import {
  GetWorkItemToolArgs,
  SearchWorkItemsToolArgs,
  type GetWorkItemToolResult,
  type SearchWorkItemsToolResult,
} from "@t3team/sdk";
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import type { T3TeamToolCallResult } from "./t3team-toolBroker.ts";
import { errorResult, foldResult, okResult } from "./t3team-toolBrokerHelpers.ts";

const SEARCH_TOOL_ID = "t3team.work_item.search";
const GET_TOOL_ID = "t3team.work_item.get";

export function isT3TeamWorkItemReadTool(tool: string): boolean {
  return tool === SEARCH_TOOL_ID || tool === GET_TOOL_ID;
}

/**
 * Host-side handlers; a failure's message reaches the agent verbatim. `search`/`get` re-resolve the
 * project's usable Jira binding on every call and fail with the not-connected text without one, so
 * a sign-out between bind and call still refuses.
 */
export type T3TeamWorkItemReadToolHandlers = {
  readonly connected: (threadId: ThreadId) => Effect.Effect<boolean>;
  readonly search: (
    args: typeof SearchWorkItemsToolArgs.Type,
    threadId: ThreadId,
  ) => Effect.Effect<SearchWorkItemsToolResult, string>;
  readonly get: (
    args: typeof GetWorkItemToolArgs.Type,
    threadId: ThreadId,
  ) => Effect.Effect<GetWorkItemToolResult, string>;
};

const decodeSearch = Schema.decodeUnknownExit(SearchWorkItemsToolArgs);
const decodeGet = Schema.decodeUnknownExit(GetWorkItemToolArgs);

export function callT3TeamWorkItemReadTool(input: {
  readonly tool: string;
  readonly scopeLabel: string;
  readonly toolArgs: unknown;
  readonly threadId?: ThreadId | undefined;
  readonly workItemReadTools?: T3TeamWorkItemReadToolHandlers | undefined;
}): Effect.Effect<T3TeamToolCallResult, never> {
  const { tool, threadId, workItemReadTools: handlers } = input;
  if (handlers === undefined || threadId === undefined) {
    return Effect.succeed(errorResult(`Tool '${tool}' is not enabled ${input.scopeLabel}.`));
  }
  if (tool === SEARCH_TOOL_ID) {
    const decoded = decodeSearch(input.toolArgs ?? {});
    return Exit.isFailure(decoded)
      ? Effect.succeed(invalid(tool, decoded.cause))
      : foldResult(handlers.search(decoded.value, threadId), okResult, errorResult);
  }
  const decoded = decodeGet(input.toolArgs ?? {});
  return Exit.isFailure(decoded)
    ? Effect.succeed(invalid(tool, decoded.cause))
    : foldResult(handlers.get(decoded.value, threadId), okResult, errorResult);
}

const invalid = (tool: string, cause: unknown) =>
  errorResult(`Invalid arguments for ${tool}: ${String(cause)}`);
