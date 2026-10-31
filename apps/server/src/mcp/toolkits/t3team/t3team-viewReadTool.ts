/**
 * MCP wrapper for `t3team.view.read` (the broker's read model, extended with the published view
 * context). Behavior lives in the broker; the description comes from the catalog. Off unless
 * `AGENTS_VIEW_CONTEXT` is on (`t3team-mcpToolFeatureGate.ts`).
 */
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { OrchestratorMcpFailure } from "@t3tools/contracts";
import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

export const T3TeamViewReadTool = Tool.make("t3_view_read", {
  description: mcpDescriptionOf("t3team.view.read"),
  // `parameters` omitted: it takes none, and `Schema.Struct({})` renders a non-object schema.
  success: Schema.Unknown,
  failure: Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]),
  dependencies: [McpInvocationContext.McpInvocationContext, T3TeamToolBroker],
});
