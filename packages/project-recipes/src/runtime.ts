import * as Schema from "effect/Schema";

import { ProjectRecipeWorkflowCollectInputRequest } from "./input.ts";
import {
  ProjectRecipeConversationCard,
  ProjectRecipeConversationCardAction,
  ProjectRecipeConversationCardActionStyle,
  ProjectRecipeConversationCardKind,
  ProjectRecipeWorkflowSystemMessageSpec,
} from "./message.ts";
import { RecipeSurface } from "./surface.ts";

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown);

export const PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH = "t3work.recipe.launch";
export const PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP = "t3work.recipe.workflow.step";
export const PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD = "t3work.recipe.workflow.card";
export const PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD_ACTION =
  "t3work.recipe.workflow.card-action";

export const ProjectRecipeWorkflowAgentStep = Schema.Struct({
  kind: Schema.Literal("agent"),
  id: Schema.String,
  promptPath: Schema.optional(Schema.String),
  promptText: Schema.optional(Schema.String),
});
export type ProjectRecipeWorkflowAgentStep = typeof ProjectRecipeWorkflowAgentStep.Type;

export const ProjectRecipeWorkflowScriptStep = Schema.Struct({
  kind: Schema.Literal("script"),
  id: Schema.String,
  module: Schema.String,
});
export type ProjectRecipeWorkflowScriptStep = typeof ProjectRecipeWorkflowScriptStep.Type;

export const ProjectRecipeWorkflowToolStep = Schema.Struct({
  kind: Schema.Literal("tool"),
  id: Schema.String,
  toolName: Schema.String,
  input: Schema.optional(JsonRecord),
});
export type ProjectRecipeWorkflowToolStep = typeof ProjectRecipeWorkflowToolStep.Type;

export const ProjectRecipeWorkflowPresentMessageStep = Schema.Struct({
  kind: Schema.Literal("present-message"),
  id: Schema.String,
  message: ProjectRecipeWorkflowSystemMessageSpec,
});
export type ProjectRecipeWorkflowPresentMessageStep =
  typeof ProjectRecipeWorkflowPresentMessageStep.Type;

export const ProjectRecipeWorkflowCollectInputStep = Schema.Struct({
  kind: Schema.Literal("collect-input"),
  id: Schema.String,
  request: ProjectRecipeWorkflowCollectInputRequest,
});
export type ProjectRecipeWorkflowCollectInputStep =
  typeof ProjectRecipeWorkflowCollectInputStep.Type;

export const ProjectRecipeWorkflowStep = Schema.Union([
  ProjectRecipeWorkflowAgentStep,
  ProjectRecipeWorkflowScriptStep,
  ProjectRecipeWorkflowToolStep,
  ProjectRecipeWorkflowPresentMessageStep,
  ProjectRecipeWorkflowCollectInputStep,
]);
export type ProjectRecipeWorkflowStep = typeof ProjectRecipeWorkflowStep.Type;

export const ProjectRecipeWorkflowDocument = Schema.Struct({
  steps: Schema.Array(ProjectRecipeWorkflowStep),
});
export type ProjectRecipeWorkflowDocument = typeof ProjectRecipeWorkflowDocument.Type;

export const ProjectRecipeWorkflowLaunch = Schema.Struct({
  kind: Schema.Literal("recipe"),
  recipeId: Schema.String,
  recipeVersion: Schema.optional(Schema.String),
  parameters: Schema.optional(JsonRecord),
  kickoff: Schema.optional(ProjectRecipeWorkflowDocument),
  title: Schema.String,
  description: Schema.String,
  source: Schema.Literals(["bundled", "project-local"]),
  surface: RecipeSurface,
  reason: Schema.optional(Schema.String),
  recipePath: Schema.optional(Schema.String),
  promptPath: Schema.optional(Schema.String),
  workflowPath: Schema.optional(Schema.String),
  allowedToolGroups: Schema.optional(Schema.Array(Schema.String)),
});
export type ProjectRecipeWorkflowLaunch = typeof ProjectRecipeWorkflowLaunch.Type;

export const ProjectRecipeLaunchPhase = Schema.Literals([
  "queued",
  "creating-thread",
  "bootstrapping-agent",
  "running",
  "waiting-for-input",
  "completed",
  "failed",
]);
export type ProjectRecipeLaunchPhase = typeof ProjectRecipeLaunchPhase.Type;

export const ProjectRecipeLaunchContext = Schema.Struct({
  displayId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.String),
});
export type ProjectRecipeLaunchContext = typeof ProjectRecipeLaunchContext.Type;

export const ProjectRecipeLaunchActivityPayload = Schema.Struct({
  recipeId: Schema.String,
  recipeVersion: Schema.optional(Schema.String),
  parameters: Schema.optional(JsonRecord),
  kickoff: Schema.optional(ProjectRecipeWorkflowDocument),
  workflowRunId: Schema.String,
  title: Schema.String,
  description: Schema.String,
  source: Schema.Literals(["bundled", "project-local"]),
  surface: RecipeSurface,
  phase: ProjectRecipeLaunchPhase,
  reason: Schema.optional(Schema.String),
  recipePath: Schema.optional(Schema.String),
  promptPath: Schema.optional(Schema.String),
  workflowPath: Schema.optional(Schema.String),
  allowedToolGroups: Schema.optional(Schema.Array(Schema.String)),
  workitem: Schema.optional(ProjectRecipeLaunchContext),
  error: Schema.optional(Schema.String),
});
export type ProjectRecipeLaunchActivityPayload = typeof ProjectRecipeLaunchActivityPayload.Type;

export const ProjectRecipeWorkflowStepPhase = Schema.Literals([
  "started",
  "completed",
  "waiting",
  "failed",
]);
export type ProjectRecipeWorkflowStepPhase = typeof ProjectRecipeWorkflowStepPhase.Type;

export const ProjectRecipeWorkflowStepActivityPayload = Schema.Struct({
  workflowRunId: Schema.String,
  stepId: Schema.String,
  stepKind: Schema.String,
  phase: ProjectRecipeWorkflowStepPhase,
  detail: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type ProjectRecipeWorkflowStepActivityPayload =
  typeof ProjectRecipeWorkflowStepActivityPayload.Type;

export const ProjectRecipeWorkflowCardPhase = Schema.Literals([
  "presented",
  "updated",
  "completed",
]);
export type ProjectRecipeWorkflowCardPhase = typeof ProjectRecipeWorkflowCardPhase.Type;

export const ProjectRecipeWorkflowCardActivityPayload = Schema.Struct({
  workflowRunId: Schema.String,
  stepId: Schema.String,
  phase: ProjectRecipeWorkflowCardPhase,
  awaitingActionId: Schema.optional(Schema.String),
  completedActionId: Schema.optional(Schema.String),
  card: ProjectRecipeConversationCard,
});
export type ProjectRecipeWorkflowCardActivityPayload =
  typeof ProjectRecipeWorkflowCardActivityPayload.Type;

export const ProjectRecipeWorkflowCardActionActivityPayload = Schema.Struct({
  workflowRunId: Schema.String,
  stepId: Schema.String,
  cardId: Schema.String,
  actionId: Schema.String,
  submit: Schema.optional(JsonRecord),
});
export type ProjectRecipeWorkflowCardActionActivityPayload =
  typeof ProjectRecipeWorkflowCardActionActivityPayload.Type;

export const SubmitProjectRecipeCardActionRequest = Schema.Struct({
  threadId: Schema.String,
  cardId: Schema.String,
  actionId: Schema.String,
  submit: Schema.optional(JsonRecord),
});
export type SubmitProjectRecipeCardActionRequest = typeof SubmitProjectRecipeCardActionRequest.Type;

export const ProjectRecipeWorkflowLaunchToolDescriptor = Schema.Struct({
  id: Schema.String,
  label: Schema.optional(Schema.String),
  capabilities: Schema.Array(Schema.Literals(["read", "write"])),
});
export type ProjectRecipeWorkflowLaunchToolDescriptor =
  typeof ProjectRecipeWorkflowLaunchToolDescriptor.Type;

export const ProjectRecipeWorkflowLaunchToolContext = Schema.Struct({
  surface: Schema.String,
  tools: Schema.Array(ProjectRecipeWorkflowLaunchToolDescriptor),
  state: Schema.Unknown,
});
export type ProjectRecipeWorkflowLaunchToolContext =
  typeof ProjectRecipeWorkflowLaunchToolContext.Type;

export const ProjectRecipeDeterministicLaunchEffect = Schema.Struct({
  kind: Schema.Literal("view-state-patch"),
  stepId: Schema.String,
  toolName: Schema.String,
  statePatch: JsonRecord,
  promptText: Schema.optional(Schema.String),
});
export type ProjectRecipeDeterministicLaunchEffect =
  typeof ProjectRecipeDeterministicLaunchEffect.Type;

export const ProjectRecipeDeterministicCompletionActivity = Schema.Struct({
  title: Schema.String,
  description: Schema.optional(Schema.String),
  tone: Schema.Literals(["success", "info"]),
});
export type ProjectRecipeDeterministicCompletionActivity =
  typeof ProjectRecipeDeterministicCompletionActivity.Type;

export const LaunchProjectRecipeWorkflowRequest = Schema.Struct({
  threadId: Schema.optional(Schema.String),
  workspaceRoot: Schema.optional(Schema.String),
  kickoffMessage: Schema.optional(Schema.String),
  titleSeed: Schema.optional(Schema.String),
  createdAt: Schema.String,
  modelSelection: Schema.optional(
    Schema.Struct({
      instanceId: Schema.String,
      model: Schema.String,
    }),
  ),
  runtimeMode: Schema.optional(Schema.String),
  interactionMode: Schema.optional(Schema.String),
  launch: ProjectRecipeWorkflowLaunch,
  toolContext: Schema.optional(ProjectRecipeWorkflowLaunchToolContext),
});
export type LaunchProjectRecipeWorkflowRequest = typeof LaunchProjectRecipeWorkflowRequest.Type;

export const LaunchProjectRecipeWorkflowResponse = Schema.Struct({
  ok: Schema.Boolean,
  mode: Schema.optional(Schema.Literals(["thread", "deterministic"])),
  workflowRunId: Schema.optional(Schema.String),
  effects: Schema.optional(Schema.Array(ProjectRecipeDeterministicLaunchEffect)),
  completionActivity: Schema.optional(ProjectRecipeDeterministicCompletionActivity),
});
export type LaunchProjectRecipeWorkflowResponse = typeof LaunchProjectRecipeWorkflowResponse.Type;

export const SubmitProjectRecipeCardActionResponse = Schema.Struct({
  ok: Schema.Boolean,
});
export type SubmitProjectRecipeCardActionResponse =
  typeof SubmitProjectRecipeCardActionResponse.Type;

export const isProjectRecipeLaunchActivityPayload = Schema.is(ProjectRecipeLaunchActivityPayload);
export const isProjectRecipeWorkflowStepActivityPayload = Schema.is(
  ProjectRecipeWorkflowStepActivityPayload,
);
export const isProjectRecipeWorkflowCardActivityPayload = Schema.is(
  ProjectRecipeWorkflowCardActivityPayload,
);
export const isProjectRecipeWorkflowCardActionActivityPayload = Schema.is(
  ProjectRecipeWorkflowCardActionActivityPayload,
);
