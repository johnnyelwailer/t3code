import * as Schema from "effect/Schema";

export const ProjectRecipeKickoffGuideSection = Schema.Literals([
  "context-summary",
  "available-context-keys",
  "capabilities",
]);
export type ProjectRecipeKickoffGuideSection = typeof ProjectRecipeKickoffGuideSection.Type;

export const ProjectRecipeKickoffPromptRequest = Schema.Struct({
  title: Schema.String,
  body: Schema.optional(Schema.String),
  sections: Schema.optional(Schema.Array(ProjectRecipeKickoffGuideSection)),
  examples: Schema.optional(Schema.Array(Schema.String)),
  capabilities: Schema.optional(Schema.Array(Schema.String)),
  responseInstructions: Schema.optional(Schema.String),
});
export type ProjectRecipeKickoffPromptRequest = typeof ProjectRecipeKickoffPromptRequest.Type;

export const ProjectRecipeKickoffWaitForInputStep = Schema.Struct({
  kind: Schema.Literal("wait-for-kickoff-input"),
  id: Schema.String,
  when: Schema.optional(Schema.Literals(["missing-prompt", "always"])),
  promptRequest: ProjectRecipeKickoffPromptRequest,
});
export type ProjectRecipeKickoffWaitForInputStep = typeof ProjectRecipeKickoffWaitForInputStep.Type;

export const ProjectRecipeKickoffRunInteractiveAgentStep = Schema.Struct({
  kind: Schema.Literal("run-interactive-agent"),
  id: Schema.String,
});
export type ProjectRecipeKickoffRunInteractiveAgentStep =
  typeof ProjectRecipeKickoffRunInteractiveAgentStep.Type;

export const ProjectRecipeKickoffStep = Schema.Union([
  ProjectRecipeKickoffWaitForInputStep,
  ProjectRecipeKickoffRunInteractiveAgentStep,
]);
export type ProjectRecipeKickoffStep = typeof ProjectRecipeKickoffStep.Type;

export const ProjectRecipeKickoffProgram = Schema.Struct({
  version: Schema.Literal(1),
  steps: Schema.Array(ProjectRecipeKickoffStep),
});
export type ProjectRecipeKickoffProgram = typeof ProjectRecipeKickoffProgram.Type;
