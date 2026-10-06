/**
 * MCP wrappers for the My Work tools. Behavior stays in the broker
 * (`t3team-toolBrokerBindingMyWork.ts`); descriptions come from the catalog, so the agent reads
 * the same text the broker serves.
 */
import * as Schema from "effect/Schema";
import { Tool } from "effect/unstable/ai";

import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

const dependencies = [McpInvocationContext.McpInvocationContext, T3TeamToolBroker];

export const T3TeamMyWorkDigestTool = Tool.make("t3_mywork_digest", {
  description: mcpDescriptionOf("t3team.mywork.digest.read"),
  parameters: Schema.Struct({
    projectId: Schema.optional(Schema.String).annotate({
      description: "App project id. Omit to read the digest across all Jira-bound projects.",
    }),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});

const ArrangeItem = Schema.Struct({
  ticketId: Schema.String.annotate({ description: "A tickets[].id of the digest read." }),
  why: Schema.optional(Schema.String).annotate({ description: "One short line shown beside it." }),
});

const ArrangeSection = Schema.Struct({
  id: Schema.String.annotate({ description: "Unique within the plan." }),
  kind: Schema.Literals(["items", "reviews"]),
  widget: Schema.optional(Schema.String).annotate({
    description: "my-work.tickets or my-work.reviews; defaults to the widget for the kind.",
  }),
  placement: Schema.Literals(["side", "main", "footer"]),
  heading: Schema.String,
  hint: Schema.optional(Schema.String),
  items: Schema.Array(ArrangeItem),
  reviewIds: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "A 'reviews' section's pull requests: review-owed changeRequests[].id.",
  }),
});

export const T3TeamMyWorkArrangeTool = Tool.make("t3_mywork_arrange", {
  description: mcpDescriptionOf("t3team.mywork.arrange"),
  parameters: Schema.Struct({
    projectId: Schema.optional(Schema.String).annotate({
      description: "App project id. Omit to arrange the digest across all projects.",
    }),
    plan: Schema.optional(
      Schema.Struct({
        producer: Schema.optional(Schema.Literal("agent")),
        producedAt: Schema.optional(Schema.String),
        sections: Schema.Array(ArrangeSection),
      }),
    ).annotate({ description: "The arrangement. Give exactly one of plan or reset." }),
    reset: Schema.optional(Schema.Boolean).annotate({
      description: "true: drop the stored arrangement and return to the default layout.",
    }),
  }),
  success: Schema.Unknown,
  failure: T3TeamMcpToolError,
  dependencies,
});
