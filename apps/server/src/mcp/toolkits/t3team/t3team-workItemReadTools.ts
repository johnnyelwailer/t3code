/**
 * MCP wrappers for the work-item read tools. Behavior and scoping live in the broker
 * (`t3team-toolBrokerBindingWorkItemRead.ts`); the parameters are the SDK's schemas and the
 * descriptions come from the catalog, so an agent, a workflow body and the broker share one contract.
 *
 * Listed only while Jira is connected for the calling thread's project (account state, not the
 * thread's tool context): see `t3team-mcpToolThreadList.ts`, which also drops them when the broker
 * is unreachable. A stale call is answered by the broker's refusal.
 */
import { GetWorkItemToolArgs, SearchWorkItemsToolArgs } from "@t3team/sdk";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { OrchestratorMcpFailure } from "@t3tools/contracts";
import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

const T3TeamToolFailure = Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]);
const dependencies = [McpInvocationContext.McpInvocationContext, T3TeamToolBroker];

export const T3TeamWorkItemSearchTool = Tool.make("t3_work_item_search", {
  description: mcpDescriptionOf("t3team.work_item.search"),
  parameters: SearchWorkItemsToolArgs,
  success: Schema.Unknown,
  failure: T3TeamToolFailure,
  dependencies,
});

export const T3TeamWorkItemGetTool = Tool.make("t3_work_item_get", {
  description: mcpDescriptionOf("t3team.work_item.get"),
  parameters: GetWorkItemToolArgs,
  success: Schema.Unknown,
  failure: T3TeamToolFailure,
  dependencies,
});
