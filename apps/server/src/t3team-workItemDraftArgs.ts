/**
 * The argument contract of the single draft tool (`t3team.work_item.draft`, `t3_work_item_draft`
 * over /mcp) and its mapping onto the existing canonical draft tools. The op table is the whole
 * mapping: no op has an implementation of its own, each is answered by the canonical
 * `*.draft_*` tool through the same broker path a workflow body uses.
 *
 * `issue_id` is REQUIRED and must be a work item key: unlike a workflow body, an /mcp thread has no
 * open view to fall back on, and a key is the only shape the project scope check can verify.
 */
import * as Schema from "effect/Schema";

import { parseIssueKey } from "./t3team-workItemReadQuery.ts";

const WORK_ITEM_DRAFT_OPS = [
  "description",
  "comment",
  "assignee",
  "estimate",
  "status",
  "subtask_create",
  "link_add",
  "link_remove",
] as const;
type WorkItemDraftOp = (typeof WORK_ITEM_DRAFT_OPS)[number];

export const WorkItemDraftToolArgs = Schema.Struct({
  op: Schema.Literals(WORK_ITEM_DRAFT_OPS),
  /** The work item the draft is about; for `subtask_create` the parent. */
  issue_id: Schema.String,
  body: Schema.optional(Schema.String),
  assignee_account_id: Schema.optional(Schema.NullOr(Schema.String)),
  assignee_display_name: Schema.optional(Schema.String),
  estimate_value: Schema.optional(Schema.NullOr(Schema.Number)),
  estimate_mode: Schema.optional(Schema.Literals(["points", "hours"])),
  target_status: Schema.optional(Schema.String),
  summary: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  estimate_hours: Schema.optional(Schema.Number),
  other_issue_id: Schema.optional(Schema.String),
  link_type_name: Schema.optional(Schema.String),
  direction: Schema.optional(Schema.Literals(["inward", "outward"])),
  link_id: Schema.optional(Schema.String),
});
type WorkItemDraftToolArgs = typeof WorkItemDraftToolArgs.Type;

const OPS: Readonly<
  Record<
    WorkItemDraftOp,
    { readonly tool: string; readonly fields: ReadonlyArray<keyof WorkItemDraftToolArgs> }
  >
> = {
  description: { tool: "t3team.work_item.description.draft_update", fields: ["body"] },
  comment: { tool: "t3team.work_item.comment.draft_create", fields: ["body"] },
  assignee: {
    tool: "t3team.work_item.assignee.draft_update",
    fields: ["assignee_account_id", "assignee_display_name"],
  },
  estimate: {
    tool: "t3team.work_item.estimate.draft_update",
    fields: ["estimate_value", "estimate_mode"],
  },
  status: { tool: "t3team.work_item.status.draft_update", fields: ["target_status"] },
  subtask_create: {
    tool: "t3team.work_item.subtask.draft_create",
    fields: ["summary", "description", "estimate_hours"],
  },
  link_add: {
    tool: "t3team.work_item.link.draft_create",
    fields: ["other_issue_id", "link_type_name", "direction"],
  },
  link_remove: { tool: "t3team.work_item.link.draft_remove", fields: ["link_id"] },
};

/** The canonical draft tool and the arguments it is called with, or the reason the call is refused. */
export function toCanonicalDraftCall(
  args: WorkItemDraftToolArgs,
): { readonly tool: string; readonly toolArgs: Record<string, unknown> } | string {
  const issueKey = parseIssueKey(args.issue_id);
  if (issueKey === null) {
    return `issue_id must be a work item key like PROJ-12, got '${args.issue_id}'.`;
  }
  const otherKey = args.other_issue_id === undefined ? null : parseIssueKey(args.other_issue_id);
  if (args.other_issue_id !== undefined && otherKey === null) {
    return `other_issue_id must be a work item key like PROJ-12, got '${args.other_issue_id}'.`;
  }
  const { tool, fields } = OPS[args.op];
  const present = Object.fromEntries(
    fields.flatMap((field) => (args[field] === undefined ? [] : [[field, args[field]]])),
  );
  // Only the checked key reaches the canonical tool, under the one name it reads first.
  return {
    tool,
    toolArgs: {
      ...present,
      ...(otherKey === null || args.op !== "link_add" ? {} : { other_issue_id: otherKey }),
      ...(args.op === "subtask_create" ? { parent_issue_id: issueKey } : { issue_id: issueKey }),
    },
  };
}
