/**
 * MCP wrapper for the thread-bound draft tool `t3_work_item_draft`: ONE tool with an `op`
 * discriminator (like `t3_task_ops`) so an agent pays for one description. Behavior and scoping live
 * in the broker (`t3team-toolBrokerBindingWorkItemDraft.ts`); the description is the catalog's.
 *
 * Listed only while a usable Jira account is bound to the calling thread's project AND
 * `WORKITEM_DETAIL_DRAFTS` is on (`t3team-mcpToolThreadList.ts`, `t3team-mcpToolFeatureGate.ts`).
 * A stale call is answered by the flag refusal or the broker's not-connected refusal.
 */
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { OrchestratorMcpFailure } from "@t3tools/contracts";
import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import { WorkItemDraftToolArgs } from "../../../t3team-workItemDraftArgs.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

export const T3TeamWorkItemDraftTool = Tool.make("t3_work_item_draft", {
  description: mcpDescriptionOf("t3team.work_item.draft"),
  parameters: WorkItemDraftToolArgs,
  success: Schema.Unknown,
  failure: Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]),
  dependencies: [McpInvocationContext.McpInvocationContext, T3TeamToolBroker],
});
