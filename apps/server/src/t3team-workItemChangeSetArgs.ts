/**
 * Argument contract of `t3team.work_item.change_set` (`t3_work_item_change_set` over /mcp): a title
 * and 1..25 operations, each exactly an argument object of `t3_work_item_draft` (same op table, no
 * link_remove).
 */
import { WORK_ITEM_CHANGE_SET_MAX_OPERATIONS } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { WorkItemDraftToolArgs } from "./t3team-workItemDraftArgs.ts";

export const WorkItemChangeSetToolArgs = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  operations: Schema.Array(WorkItemDraftToolArgs).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(WORK_ITEM_CHANGE_SET_MAX_OPERATIONS),
  ),
});

/** Operations undecoded, so one bad operation is reported by index instead of failing the call. */
export const WorkItemChangeSetEnvelope = Schema.Struct({
  title: WorkItemChangeSetToolArgs.fields.title,
  operations: Schema.Array(Schema.Unknown).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(WORK_ITEM_CHANGE_SET_MAX_OPERATIONS),
  ),
});
