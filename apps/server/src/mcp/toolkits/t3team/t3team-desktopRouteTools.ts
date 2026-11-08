/**
 * `request_desktop_route` (`t3team.desktop_route.request`): asks the user to let ONE host be reached
 * through their own computer. It only asks; the user's desktop web client makes the grant on accept.
 *
 * @module t3team-desktopRouteTools
 */
import { OrchestratorMcpFailure, RuntimeRequestId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamAskUserWriter } from "./t3team-askUserWriter.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

export const T3TeamDesktopRouteRequestTool = Tool.make("request_desktop_route", {
  description: mcpDescriptionOf("t3team.desktop_route.request"),
  parameters: Schema.Struct({
    target: Schema.String.annotate({
      description: "One host name, URL, IP address or small range (/24 or narrower). No wildcards.",
    }),
    reason: Schema.String.annotate({
      description: "One or two sentences the user reads: what fails and why this host is needed.",
    }),
    internal: Schema.optional(Schema.Boolean).annotate({
      description:
        "True when the host is an internal address that resolves to a private network address (for example an internal package registry).",
    }),
  }),
  success: Schema.Struct({
    asked: Schema.Literal(true),
    requestId: RuntimeRequestId,
    questionId: Schema.String,
    target: Schema.String,
    note: Schema.String,
  }),
  failure: Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]),
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    T3TeamAskUserWriter,
  ],
});
