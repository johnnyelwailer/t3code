/**
 * MCP wrappers for the My Work tools. Behavior stays in the broker
 * (`t3team-toolBrokerBindingMyWork.ts`); descriptions come from the catalog, so the agent reads
 * the same text the broker serves.
 */
import * as Schema from "effect/Schema";
import { Tool } from "effect/ai";

import { OrchestratorMcpFailure } from "@t3tools/contracts";
import { T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamMcpToolError } from "./t3team-mcpToolError.ts";
import { mcpDescriptionOf } from "./t3team-mcpToolDescription.ts";

/** Mirrors tools.ts: the access declaration in handlers.ts refuses with an OrchestratorMcpFailure. */
const T3TeamToolFailure = Schema.Union([T3TeamMcpToolError, OrchestratorMcpFailure]);

const dependencies = [McpInvocationContext.McpInvocationContext, T3TeamToolBroker];

export const T3TeamMyWorkDigestTool = Tool.make("t3_mywork_digest", {
  description: mcpDescriptionOf("t3team.mywork.digest.read"),
  parameters: Schema.Struct({
    projectId: Schema.optional(Schema.String).annotate({
      description: "App project id. Omit to read the calling thread's project.",
    }),
    scope: Schema.optional(Schema.Literals(["project", "all"])).annotate({
      description: "all: the viewer's cross-project digest, even from a project thread.",
    }),
  }),
  success: Schema.Unknown,
  failure: T3TeamToolFailure,
  dependencies,
});

const ArrangeItem = Schema.Struct({
  ticketId: Schema.String.annotate({ description: "A tickets[].id of the digest read." }),
  why: Schema.optional(Schema.String).annotate({ description: "One short line shown beside it." }),
});

const ArrangeSection = Schema.Struct({
  id: Schema.String.annotate({ description: "Unique within the plan." }),
  kind: Schema.Literals(["items", "reviews", "graph", "widget"]),
  widget: Schema.optional(Schema.String).annotate({
    description:
      "my-work.tickets, my-work.reviews or my-work.yesterday; defaults to the widget for the kind " +
      "(a 'graph' section must name one). A 'widget' section leaves this unset.",
  }),
  widgetHtml: Schema.optional(Schema.String).annotate({
    description: "Sandboxed markup for a 'widget' section. No external network.",
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
      description: "App project id. Omit to arrange the calling thread's project.",
    }),
    scope: Schema.optional(Schema.Literals(["project", "all"])).annotate({
      description: "all: the viewer's cross-project digest, even from a project thread.",
    }),
    plan: Schema.optional(
      Schema.Struct({
        producer: Schema.optional(Schema.Literal("agent")),
        producedAt: Schema.optional(Schema.String),
        sections: Schema.Array(ArrangeSection),
      }),
    ).annotate({ description: "The arrangement. Give exactly one of plan or reset." }),
    channel: Schema.optional(Schema.Literals(["live", "draft"])).annotate({
      description: "With a plan. draft overlays the digest until promote. Default live.",
    }),
    reset: Schema.optional(Schema.Boolean).annotate({
      description: "true: drop the stored arrangement and any draft.",
    }),
    promote: Schema.optional(Schema.Boolean).annotate({
      description: "true: copy the draft onto the live arrangement and drop the draft.",
    }),
    discardDraft: Schema.optional(Schema.Boolean).annotate({
      description: "true: drop the draft. The live arrangement stays.",
    }),
    recipe: Schema.optional(Schema.Unknown).annotate({
      description:
        "Write a project-scoped maintain recipe. Exclusive with plan, reset, promote, and discardDraft.",
    }),
  }),
  success: Schema.Unknown,
  failure: T3TeamToolFailure,
  dependencies,
});
