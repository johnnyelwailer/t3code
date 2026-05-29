import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { EventId, MessageId, ThreadId } from "@t3tools/contracts";
import { T3workActionRecipeContext } from "@t3tools/project-context";
import {
  ProjectRecipeConversationCard,
  ProjectRecipeWorkflowLaunch,
  ProjectRecipeWorkflowStep as ProjectRecipeWorkflowStepSchema,
  type ProjectRecipeLaunchActivityPayload,
  type ProjectRecipeLaunchPhase,
  type ProjectRecipeWorkflowLaunch as ProjectRecipeWorkflowLaunchType,
} from "@t3tools/project-recipes";
import { fromJsonStringPretty } from "@t3tools/shared/schemaJson";
import { t3workRandomUUID } from "./t3work-random.ts";

const PersistedRecipeWorkflowCardActionWait = Schema.Struct({
  kind: Schema.Literal("card-action"),
  stepId: Schema.String,
  cardId: Schema.String,
  cardActivityStepId: Schema.String,
  actionId: Schema.String,
  card: ProjectRecipeConversationCard,
});

const PersistedRecipeWorkflowAgentMessageWait = Schema.Struct({
  kind: Schema.Literal("agent-message"),
  stepId: Schema.String,
});

const PersistedRecipeWorkflowWait = Schema.Union([
  PersistedRecipeWorkflowCardActionWait,
  PersistedRecipeWorkflowAgentMessageWait,
]);

const PersistedRecipeWorkflowRunStateSchema = Schema.Struct({
  version: Schema.Literal(1),
  threadId: ThreadId,
  workflowRunId: Schema.String,
  workspaceRoot: Schema.String,
  runRootPath: Schema.String,
  workflowPath: Schema.optional(Schema.String),
  recipePath: Schema.optional(Schema.String),
  launchContext: Schema.optional(T3workActionRecipeContext),
  launch: ProjectRecipeWorkflowLaunch,
  kickoffMessage: Schema.String,
  steps: Schema.Array(ProjectRecipeWorkflowStepSchema),
  nextStepIndex: Schema.Int,
  waitingFor: Schema.optional(PersistedRecipeWorkflowWait),
  updatedAt: Schema.String,
});

export type PersistedRecipeWorkflowRunState = typeof PersistedRecipeWorkflowRunStateSchema.Type;

const PersistedRecipeWorkflowRunStateJson = fromJsonStringPretty(
  PersistedRecipeWorkflowRunStateSchema,
);

export const decodePersistedRecipeWorkflowRunState = Schema.decodeUnknownEffect(
  PersistedRecipeWorkflowRunStateJson,
);

export const encodePersistedRecipeWorkflowRunState = Schema.encodeEffect(
  PersistedRecipeWorkflowRunStateJson,
);

export function resolveWithinRoot(
  pathService: Path.Path,
  rootPath: string,
  requestedPath: string,
): string {
  const resolvedPath = pathService.resolve(rootPath, requestedPath);
  const relativePath = pathService.relative(rootPath, resolvedPath);
  if (
    relativePath.startsWith("..") ||
    relativePath === ".." ||
    pathService.isAbsolute(relativePath)
  ) {
    throw new Error(`Path '${requestedPath}' resolves outside '${rootPath}'.`);
  }
  return resolvedPath;
}

export function workflowRunIdForThread(threadId: ThreadId): string {
  return `t3work:recipe-workflow:${threadId}`;
}

export function workflowRunIdForDeterministicLaunch(): string {
  return `t3work:recipe-workflow:deterministic:${t3workRandomUUID()}`;
}

export function launchActivityId(threadId: ThreadId): EventId {
  return EventId.make(`t3work:recipe-launch:${threadId}`);
}

export function cardActivityId(threadId: ThreadId, stepId: string): EventId {
  return EventId.make(`t3work:recipe-card:${threadId}:${stepId}`);
}

export function stepActivityId(threadId: ThreadId, stepId: string): EventId {
  return EventId.make(`t3work:recipe-step:${threadId}:${stepId}`);
}

export function workflowMessageId(threadId: ThreadId, stepId: string): MessageId {
  return MessageId.make(`t3work:recipe-message:${threadId}:${stepId}`);
}

export function actionActivityId(threadId: ThreadId, stepId: string, actionId: string): EventId {
  return EventId.make(
    `t3work:recipe-card-action:${threadId}:${stepId}:${actionId}:${t3workRandomUUID()}`,
  );
}

export function buildLaunchActivityPayload(input: {
  launch: ProjectRecipeWorkflowLaunchType;
  workflowRunId: string;
  phase: ProjectRecipeLaunchPhase;
  error?: string;
}): ProjectRecipeLaunchActivityPayload {
  return {
    recipeId: input.launch.recipeId,
    ...(input.launch.recipeVersion ? { recipeVersion: input.launch.recipeVersion } : {}),
    ...(input.launch.parameters ? { parameters: input.launch.parameters } : {}),
    ...(input.launch.kickoff ? { kickoff: input.launch.kickoff } : {}),
    workflowRunId: input.workflowRunId,
    title: input.launch.title,
    description: input.launch.description,
    source: input.launch.source,
    surface: input.launch.surface as ProjectRecipeLaunchActivityPayload["surface"],
    phase: input.phase,
    ...(input.launch.reason ? { reason: input.launch.reason } : {}),
    ...(input.launch.recipePath ? { recipePath: input.launch.recipePath } : {}),
    ...(input.launch.promptPath ? { promptPath: input.launch.promptPath } : {}),
    ...(input.launch.workflowPath ? { workflowPath: input.launch.workflowPath } : {}),
    ...(input.launch.allowedToolGroups
      ? { allowedToolGroups: [...input.launch.allowedToolGroups] }
      : {}),
    ...(input.error ? { error: input.error } : {}),
  };
}

export function launchSummaryForPhase(
  phase: ProjectRecipeLaunchPhase,
  launch: ProjectRecipeWorkflowLaunchType,
): string {
  switch (phase) {
    case "creating-thread":
      return `Launching recipe ${launch.title}`;
    case "bootstrapping-agent":
      return `Bootstrapping ${launch.title}`;
    case "running":
      return `${launch.title} is running`;
    case "waiting-for-input":
      return `${launch.title} is waiting for input`;
    case "completed":
      return `${launch.title} completed`;
    case "failed":
      return `${launch.title} failed`;
    case "queued":
      return `${launch.title} queued`;
  }
}
