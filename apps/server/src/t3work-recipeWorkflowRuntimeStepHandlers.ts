import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD,
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  ProjectRecipeWorkflowCardActivityPayload,
  type ProjectRecipeWorkflowStep as ProjectRecipeWorkflowStepType,
} from "@t3tools/project-recipes";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { upsertThreadActivity } from "./t3work-recipeWorkflowRuntimeActivities.ts";
import type { PresentedWorkflowCardState } from "./t3work-recipeWorkflowRuntimeExecutionTypes.ts";
import {
  cardActivityId,
  resolveWithinRoot,
  stepActivityId,
  type PersistedRecipeWorkflowRunState,
} from "./t3work-recipeWorkflowRuntimeShared.ts";

export const handleAgentWorkflowStep = Effect.fn("handleAgentWorkflowStep")(function* (input: {
  orchestration: OrchestrationEngineShape;
  state: PersistedRecipeWorkflowRunState;
  step: Extract<ProjectRecipeWorkflowStepType, { kind: "agent" }>;
  createdAt: string;
  allowKickoffAgentStep: boolean;
  recipeBasePath: string;
  kickoffMessage: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  let kickoffMessage = input.kickoffMessage;

  if (!input.allowKickoffAgentStep) {
    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: input.state.threadId,
      activityId: stepActivityId(input.state.threadId, input.step.id),
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
      summary: "Additional workflow agent steps are not yet supported",
      payload: {
        workflowRunId: input.state.workflowRunId,
        stepId: input.step.id,
        stepKind: input.step.kind,
        phase: "failed",
        error: "Only the bootstrap kickoff agent step is supported in this first workflow runner.",
      },
      tone: "error",
    });
    return { kickoffMessage };
  }

  if (typeof input.step.promptText === "string" && input.step.promptText.trim().length > 0) {
    kickoffMessage = input.step.promptText;
  } else if (typeof input.step.promptPath === "string" && input.step.promptPath.trim().length > 0) {
    kickoffMessage = yield* fileSystem.readFileString(
      resolveWithinRoot(pathService, input.recipeBasePath, input.step.promptPath),
    );
  }

  yield* upsertThreadActivity({
    orchestration: input.orchestration,
    threadId: input.state.threadId,
    activityId: stepActivityId(input.state.threadId, input.step.id),
    createdAt: input.createdAt,
    kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
    summary: "Prepared kickoff agent step",
    payload: {
      workflowRunId: input.state.workflowRunId,
      stepId: input.step.id,
      stepKind: input.step.kind,
      phase: "completed",
      detail: "The recipe kickoff prompt was prepared for the agent.",
    },
  });

  return { kickoffMessage };
});

export const handleCardWorkflowStep = Effect.fn("handleCardWorkflowStep")(function* (input: {
  orchestration: OrchestrationEngineShape;
  state: PersistedRecipeWorkflowRunState;
  step: Extract<ProjectRecipeWorkflowStepType, { kind: "card" }>;
  createdAt: string;
}) {
  yield* upsertThreadActivity({
    orchestration: input.orchestration,
    threadId: input.state.threadId,
    activityId: cardActivityId(input.state.threadId, input.step.id),
    createdAt: input.createdAt,
    kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD,
    summary: input.step.card.title,
    payload: {
      workflowRunId: input.state.workflowRunId,
      stepId: input.step.id,
      phase: "presented",
      card: input.step.card,
    } satisfies typeof ProjectRecipeWorkflowCardActivityPayload.Type,
  });

  return {
    cardId: input.step.card.id,
    activityStepId: input.step.id,
    card: input.step.card,
  } satisfies PresentedWorkflowCardState;
});

export const handleAwaitCardActionWorkflowStep = Effect.fn("handleAwaitCardActionWorkflowStep")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    state: PersistedRecipeWorkflowRunState;
    step: Extract<ProjectRecipeWorkflowStepType, { kind: "await-card-action" }>;
    index: number;
    createdAt: string;
    kickoffMessage: string;
    lastPresentedCard: PresentedWorkflowCardState | null;
  }) {
    if (!input.lastPresentedCard) {
      yield* upsertThreadActivity({
        orchestration: input.orchestration,
        threadId: input.state.threadId,
        activityId: stepActivityId(input.state.threadId, input.step.id),
        createdAt: input.createdAt,
        kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
        summary: "Workflow is missing a card to await",
        payload: {
          workflowRunId: input.state.workflowRunId,
          stepId: input.step.id,
          stepKind: input.step.kind,
          phase: "failed",
          error: "await-card-action requires a preceding card step or script-emitted card.",
        },
        tone: "error",
      });
      return null;
    }

    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: input.state.threadId,
      activityId: cardActivityId(input.state.threadId, input.lastPresentedCard.activityStepId),
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD,
      summary: input.lastPresentedCard.card.title,
      payload: {
        workflowRunId: input.state.workflowRunId,
        stepId: input.lastPresentedCard.activityStepId,
        phase: "updated",
        awaitingActionId: input.step.actionId,
        card: input.lastPresentedCard.card,
      } satisfies typeof ProjectRecipeWorkflowCardActivityPayload.Type,
    });

    const nextState: PersistedRecipeWorkflowRunState = {
      ...input.state,
      kickoffMessage: input.kickoffMessage,
      nextStepIndex: input.index + 1,
      waitingFor: {
        stepId: input.step.id,
        cardId: input.lastPresentedCard.cardId,
        cardActivityStepId: input.lastPresentedCard.activityStepId,
        actionId: input.step.actionId,
        card: input.lastPresentedCard.card,
      },
      updatedAt: input.createdAt,
    };

    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: input.state.threadId,
      activityId: stepActivityId(input.state.threadId, input.step.id),
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
      summary: "Waiting for card action",
      payload: {
        workflowRunId: input.state.workflowRunId,
        stepId: input.step.id,
        stepKind: input.step.kind,
        phase: "waiting",
        detail: `Waiting for '${input.step.actionId}'.`,
      },
    });

    return nextState;
  },
);

export const handleUnsupportedToolWorkflowStep = Effect.fn("handleUnsupportedToolWorkflowStep")(
  function* (input: {
    orchestration: OrchestrationEngineShape;
    state: PersistedRecipeWorkflowRunState;
    step: Extract<ProjectRecipeWorkflowStepType, { kind: "tool" }>;
    createdAt: string;
  }) {
    yield* upsertThreadActivity({
      orchestration: input.orchestration,
      threadId: input.state.threadId,
      activityId: stepActivityId(input.state.threadId, input.step.id),
      createdAt: input.createdAt,
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
      summary: `Workflow tool step ${input.step.id} is not supported yet`,
      payload: {
        workflowRunId: input.state.workflowRunId,
        stepId: input.step.id,
        stepKind: input.step.kind,
        phase: "failed",
        error: `Tool steps are not supported yet (${input.step.toolName}). Use a script step for now.`,
      },
      tone: "error",
    });
  },
);
