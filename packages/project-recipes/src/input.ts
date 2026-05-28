import * as Schema from "effect/Schema";

export const ProjectRecipePromptGuideSection = Schema.Literals([
  "context-summary",
  "available-context-keys",
  "capabilities",
]);
export type ProjectRecipePromptGuideSection = typeof ProjectRecipePromptGuideSection.Type;

export const ProjectRecipePromptRequest = Schema.Struct({
  title: Schema.String,
  body: Schema.optional(Schema.String),
  sections: Schema.optional(Schema.Array(ProjectRecipePromptGuideSection)),
  examples: Schema.optional(Schema.Array(Schema.String)),
  capabilities: Schema.optional(Schema.Array(Schema.String)),
  responseInstructions: Schema.optional(Schema.String),
});
export type ProjectRecipePromptRequest = typeof ProjectRecipePromptRequest.Type;

export const ProjectRecipeWorkflowTextInputRequest = Schema.Struct({
  kind: Schema.Literal("text"),
  when: Schema.optional(Schema.Literals(["missing-prompt", "always"])),
  promptRequest: ProjectRecipePromptRequest,
});
export type ProjectRecipeWorkflowTextInputRequest =
  typeof ProjectRecipeWorkflowTextInputRequest.Type;

export const ProjectRecipeWorkflowCardActionInputRequest = Schema.Struct({
  kind: Schema.Literal("card-action"),
  actionId: Schema.String,
});
export type ProjectRecipeWorkflowCardActionInputRequest =
  typeof ProjectRecipeWorkflowCardActionInputRequest.Type;

export const ProjectRecipeWorkflowCollectInputRequest = Schema.Union([
  ProjectRecipeWorkflowTextInputRequest,
  ProjectRecipeWorkflowCardActionInputRequest,
]);
export type ProjectRecipeWorkflowCollectInputRequest =
  typeof ProjectRecipeWorkflowCollectInputRequest.Type;
