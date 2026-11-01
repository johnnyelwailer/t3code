/**
 * MCP wrapper for `t3team.view.read`. One tool with an `op` so it can later steer the view; only
 * `read` exists, and a later op changes transient view state only, never stored state.
 * Off unless `AGENTS_VIEW_CONTEXT` is on (`t3team-mcpToolFeatureGate.ts`).
 */
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { OrchestratorMcpFailure } from "@t3tools/contracts";
import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

export const T3TeamCurrentViewTool = Tool.make("t3_current_view", {
  description: mcpDescriptionOf("t3team.view.read"),
  parameters: Schema.Struct({ op: Schema.optional(Schema.Literals(["read"])) }),
  success: Schema.Unknown,
  failure: Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]),
  dependencies: [McpInvocationContext.McpInvocationContext, T3TeamToolBroker],
});
