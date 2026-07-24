/**
 * The `workflow.shape` view contract (play-as-shape view, recipe-UX design pass). A read-only
 * descriptor of WHAT A RECIPE WILL DO — its phase strip plus an ordered, kind-tagged step list
 * — derived statically from the `.workflow.ts` (SDK `deriveWorkflowShape`). The launch path
 * attaches it to a system message (`t3teamExt.attachments`, kind `"view"`); the web renders it
 * as the in-thread "plan" card (distinct from the `askUser` decision card; see
 * {@link ./workflowDecision.ts}). This schema is the host/web validation boundary for the
 * payload — the SDK `WorkflowStepKind`/`WorkflowShape` types mirror it and extend in lockstep.
 */
import * as Schema from "effect/Schema";

export const PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE = "t3team.workflow.shape";

/** The four step kinds: `read` (tool/script reads), `agent` (the agent thinks), `ask` (asks the
 * user), `act` (tool/script mutates). */
export const ProjectRecipeWorkflowStepKind = Schema.Literals(["read", "agent", "ask", "act"]);
export type ProjectRecipeWorkflowStepKind = typeof ProjectRecipeWorkflowStepKind.Type;

export const ProjectRecipeWorkflowShapeStep = Schema.Struct({
  /** The `phase()` group this step runs under, or null when it precedes any `phase()`. */
  phase: Schema.NullOr(Schema.String),
  kind: ProjectRecipeWorkflowStepKind,
  label: Schema.String,
});
export type ProjectRecipeWorkflowShapeStep = typeof ProjectRecipeWorkflowShapeStep.Type;

export const ProjectRecipeWorkflowShapePayload = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  phases: Schema.Array(Schema.Struct({ title: Schema.String })),
  steps: Schema.Array(ProjectRecipeWorkflowShapeStep),
  /** The run this plan previews (when emitted on launch). */
  workflowRunId: Schema.optional(Schema.String),
});
export type ProjectRecipeWorkflowShapePayload = typeof ProjectRecipeWorkflowShapePayload.Type;

export const isProjectRecipeWorkflowShapePayload = Schema.is(ProjectRecipeWorkflowShapePayload);
