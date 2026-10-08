/**
 * MCP wrapper for `t3team.change_request.publish`. Behavior stays in the broker
 * (`t3team-toolBrokerBindingChangeRequest.ts`), which also enforces that the tool is enabled on
 * the calling thread; the description comes from the catalog.
 */
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

export const T3TeamChangeRequestPublishTool = Tool.make("t3_change_request_publish", {
  description: mcpDescriptionOf("t3team.change_request.publish"),
  parameters: Schema.Struct({
    branch: Schema.String.annotate({ description: "Head branch to publish." }),
    base: Schema.optional(Schema.String).annotate({
      description: "Target branch. Omit for the repository's default branch.",
    }),
    paths: Schema.Array(Schema.String).annotate({
      description: "Repository-relative files to commit. Nothing else is committed.",
    }),
    commitMessage: Schema.String.annotate({
      description: "Commit message; the first line is the subject.",
    }),
    title: Schema.String.annotate({ description: "Change request title." }),
    body: Schema.String.annotate({ description: "Change request description (markdown)." }),
    draft: Schema.optional(Schema.Boolean).annotate({
      description: "Open it as a draft. Default false.",
    }),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies: [McpInvocationContext.McpInvocationContext, T3TeamToolBroker],
});
