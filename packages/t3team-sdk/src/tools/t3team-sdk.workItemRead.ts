/**
 * Read-only work-item tools (`t3team.work_item.search`, `t3team.work_item.get`). The SDK owns the
 * ids, argument/result schemas and group classification; the server broker answers them through
 * `ctx.t3team.callHostTool`, the same transport the draft tools use, so a workflow body, a thread
 * agent over `/mcp` and a recipe all get one contract with the same gates.
 *
 * SCOPE (non-negotiable): the host answers only for the thread's own project binding. There is no
 * project argument on purpose; a caller cannot name another project, and the host refuses a JQL or
 * an issue key that would leave the bound one.
 *
 * Vocabulary is neutral: `state`, `issueKey`, `assignee` as the `work-item.updated` signal payload
 * carries them (`WorkItemPayload`); nothing here names the tracker.
 */
import * as Schema from "effect/Schema";

import { integrationRead } from "../t3team-sdk.groups.ts";
import { defineTool } from "../t3team-sdk.ts";
import type { ToolHandlerCtx } from "../t3team-sdk.types.ts";
import { WorkItemPayload } from "../t3team-sdk.builtinSignalsWorkItem.ts";

export const WORK_ITEM_SEARCH_TOOL_ID = "t3team.work_item.search";
export const WORK_ITEM_GET_TOOL_ID = "t3team.work_item.get";
export const WORK_ITEM_SEARCH_MAX_LIMIT = 50;

const { changedFields: _changedFields, ...workItemPayloadFields } = WorkItemPayload.fields;

/** One work item as a list row: the signal payload's fields plus what a triage list needs. */
export const WorkItemSummary = Schema.Struct({
  ...workItemPayloadFields,
  type: Schema.optional(Schema.String),
  priority: Schema.optional(Schema.String),
  /** Parent work item (epic or story) key. */
  parentKey: Schema.optional(Schema.String),
  sprint: Schema.optional(Schema.String),
});
export type WorkItemSummary = typeof WorkItemSummary.Type;

export const SearchWorkItemsToolArgs = Schema.Struct({
  /** Any of these workflow states. */
  status: Schema.optional(Schema.Array(Schema.String)),
  /** Display name or account id; `unassigned` matches work items nobody holds. */
  assignee: Schema.optional(Schema.String),
  /** All of these labels. */
  labels: Schema.optional(Schema.Array(Schema.String)),
  type: Schema.optional(Schema.String),
  sprint: Schema.optional(Schema.String),
  /** Free text over title and description. */
  text: Schema.optional(Schema.String),
  /** Extra JQL, ANDed with the filters and with the bound project. It can only narrow. */
  jql: Schema.optional(Schema.String),
  limit: Schema.optional(
    Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(1),
      Schema.isLessThanOrEqualTo(WORK_ITEM_SEARCH_MAX_LIMIT),
    ),
  ),
  /** Opaque continuation from the previous page's `nextCursor`. */
  cursor: Schema.optional(Schema.String),
});
export type SearchWorkItemsToolArgs = typeof SearchWorkItemsToolArgs.Type;

export const SearchWorkItemsToolResult = Schema.Struct({
  ok: Schema.Literal(true),
  /** `mirror` is the host's synced copy of the project; `live` asked the tracker. */
  source: Schema.Literals(["mirror", "live"]),
  items: Schema.Array(WorkItemSummary),
  nextCursor: Schema.optional(Schema.String),
});
export type SearchWorkItemsToolResult = typeof SearchWorkItemsToolResult.Type;

export const GetWorkItemToolArgs = Schema.Struct({
  issueKey: Schema.String.check(Schema.isMinLength(1)),
});
export type GetWorkItemToolArgs = typeof GetWorkItemToolArgs.Type;

export const WorkItemComment = Schema.Struct({
  id: Schema.String,
  author: Schema.optional(Schema.String),
  body: Schema.String,
  created: Schema.optional(Schema.String),
});

/** A relation to another work item; only the key is shown, never the other item's content. */
export const WorkItemLink = Schema.Struct({ relation: Schema.String, issueKey: Schema.String });

export const GetWorkItemToolResult = Schema.Struct({
  ok: Schema.Literal(true),
  item: Schema.Struct({
    ...WorkItemSummary.fields,
    description: Schema.optional(Schema.String),
  }),
  comments: Schema.Array(WorkItemComment),
  links: Schema.Array(WorkItemLink),
  children: Schema.Array(WorkItemSummary),
});
export type GetWorkItemToolResult = typeof GetWorkItemToolResult.Type;

/** Same wording as the draft tools' host refs: a headless run has no thread, so no binding. */
async function callHostTool(ctx: ToolHandlerCtx, tool: string, args: unknown): Promise<unknown> {
  const call = ctx.t3team?.callHostTool;
  if (call === undefined) {
    throw new Error(
      `Tool '${tool}' needs a thread-bound host runtime. This run was started without one (a headless run has no thread to act on).`,
    );
  }
  return await call({ tool, args });
}

export const searchWorkItemsTool = defineTool({
  id: WORK_ITEM_SEARCH_TOOL_ID,
  group: integrationRead,
  args: SearchWorkItemsToolArgs,
  result: SearchWorkItemsToolResult,
  handler: async (args, ctx) =>
    (await callHostTool(ctx, WORK_ITEM_SEARCH_TOOL_ID, args)) as SearchWorkItemsToolResult,
});

export const getWorkItemTool = defineTool({
  id: WORK_ITEM_GET_TOOL_ID,
  group: integrationRead,
  args: GetWorkItemToolArgs,
  result: GetWorkItemToolResult,
  handler: async (args, ctx) =>
    (await callHostTool(ctx, WORK_ITEM_GET_TOOL_ID, args)) as GetWorkItemToolResult,
});
