/**
 * The `askUser` decision-card view contract (Epic 25 §askUser decision cards). When a workflow
 * suspends on `thread.askUser`, the engine broker attaches this view to the escalation message
 * (`t3workExt.attachments`, kind `"view"`); the web renders it as the in-thread "needs your
 * input" card. The attachment refs ride as SIBLING resource attachments on the same message —
 * they reuse the existing resource-card rendering and are not part of this payload.
 *
 * `affordance` mirrors the SDK's `AskAffordance` descriptor (`@t3work/sdk`
 * `schemaToAffordance`); this schema is the host/web validation boundary for it. New
 * affordance kinds extend both unions in lockstep.
 */
import * as Schema from "effect/Schema";

export const PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION = "t3work.workflow.decision";

export const ProjectRecipeWorkflowDecisionAffordance = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("choice"),
    field: Schema.optional(Schema.String),
    options: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("boolean"),
    labels: Schema.optional(Schema.Struct({ true: Schema.String, false: Schema.String })),
  }),
  Schema.Struct({
    kind: Schema.Literal("form"),
    fields: Schema.Array(
      Schema.Struct({
        name: Schema.String,
        type: Schema.Literals(["string", "number", "boolean", "literals"]),
        options: Schema.optional(Schema.Array(Schema.String)),
        optional: Schema.Boolean,
      }),
    ),
  }),
  Schema.Struct({ kind: Schema.Literal("text") }),
]);
export type ProjectRecipeWorkflowDecisionAffordance =
  typeof ProjectRecipeWorkflowDecisionAffordance.Type;

/** One scalar field of a `form` affordance (mirrors the SDK's `AskFormField`) — the shape the web
 * renders one input per. */
export type ProjectRecipeWorkflowDecisionFormField = Extract<
  ProjectRecipeWorkflowDecisionAffordance,
  { kind: "form" }
>["fields"][number];

export const ProjectRecipeWorkflowDecisionPayload = Schema.Struct({
  question: Schema.String,
  affordance: ProjectRecipeWorkflowDecisionAffordance,
  /** The pending ask's correlationId — a resolve carrying it is rejected if a different ask
   * is now pending (a stale card cannot answer a newer question). */
  correlationId: Schema.String,
  workflowRunId: Schema.optional(Schema.String),
});
export type ProjectRecipeWorkflowDecisionPayload = typeof ProjectRecipeWorkflowDecisionPayload.Type;

export const isProjectRecipeWorkflowDecisionPayload = Schema.is(
  ProjectRecipeWorkflowDecisionPayload,
);
