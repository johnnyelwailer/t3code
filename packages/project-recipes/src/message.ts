import * as Schema from "effect/Schema";

const JsonRecord = Schema.Record(Schema.String, Schema.Unknown);

export const PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD = "t3work.recipe.workflow-card";

export const ProjectRecipeConversationCardKind = Schema.Literals([
  "checklist",
  "form",
  "approval",
  "artifact-preview",
  "status",
]);
export type ProjectRecipeConversationCardKind = typeof ProjectRecipeConversationCardKind.Type;

export const ProjectRecipeConversationCardActionStyle = Schema.Literals([
  "primary",
  "secondary",
  "danger",
]);
export type ProjectRecipeConversationCardActionStyle =
  typeof ProjectRecipeConversationCardActionStyle.Type;

export const ProjectRecipeConversationCardAction = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  style: Schema.optional(ProjectRecipeConversationCardActionStyle),
  submit: Schema.optional(JsonRecord),
});
export type ProjectRecipeConversationCardAction = typeof ProjectRecipeConversationCardAction.Type;

export const ProjectRecipeConversationCard = Schema.Struct({
  kind: ProjectRecipeConversationCardKind,
  id: Schema.String,
  title: Schema.String,
  body: Schema.optional(Schema.String),
  fields: Schema.optional(Schema.Array(JsonRecord)),
  actions: Schema.optional(Schema.Array(ProjectRecipeConversationCardAction)),
});
export type ProjectRecipeConversationCard = typeof ProjectRecipeConversationCard.Type;

export const ProjectRecipeWorkflowSystemMessageSpec = Schema.Struct({
  body: Schema.optional(Schema.String),
  card: Schema.optional(ProjectRecipeConversationCard),
  visibleToUser: Schema.optional(Schema.Boolean),
  visibleToAgent: Schema.optional(Schema.Boolean),
});
export type ProjectRecipeWorkflowSystemMessageSpec =
  typeof ProjectRecipeWorkflowSystemMessageSpec.Type;
