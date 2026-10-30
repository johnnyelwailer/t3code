/**
 * MCP wrapper for `t3_work_item_draft`: ONE tool with an `op` discriminator (like `t3_task_ops`).
 * Behavior and scoping live in the broker. Listed only while Jira is bound to the thread's project
 * and `WORKITEM_DETAIL_DRAFTS` is on; a stale call gets the flag or not-connected refusal.
 */
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
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
  // `McpToolAccess.actsAsCaller` refuses with `OrchestratorMcpFailure`, which needs ThreadManagementService.
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    T3TeamToolBroker,
    ThreadManagementService.ThreadManagementService,
  ],
});
