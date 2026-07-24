import type { ProjectRecipeWorkflowCardActivityPayload } from "@t3tools/project-recipes";

import { persistStoredSidecarPersonalization } from "~/t3team/hooks/t3team-sidecarCompositionPersistence";
import {
  T3TEAM_SIDECAR_APPLY_PERSONALIZATION_RESET_TOOL,
  type T3TeamSidecarPersonalizationResetToolInput,
} from "~/t3team/t3team-sidecarPersonalizationReset";
import type {
  T3TeamDeterministicWorkflowLaunch,
  T3TeamInlineRecipeLaunchOutcome,
} from "~/t3team/t3team-inlineRecipeLaunch";

export type PendingT3TeamInlineWorkflowPrompt = {
  readonly title: string;
  readonly description: string;
  readonly workflowCard: ProjectRecipeWorkflowCardActivityPayload;
  readonly submitApprovedAction: () => Promise<T3TeamInlineRecipeLaunchOutcome | null>;
};

function isResetToolInput(value: unknown): value is T3TeamSidecarPersonalizationResetToolInput {
  return typeof value === "object" && value !== null && "nextPersonalization" in value;
}

function canRunLocalToolStep(toolName: string, toolInput: unknown) {
  return (
    toolName === T3TEAM_SIDECAR_APPLY_PERSONALIZATION_RESET_TOOL && isResetToolInput(toolInput)
  );
}

function runLocalToolStep(input: {
  readonly toolName: string;
  readonly toolInput: unknown;
}): T3TeamInlineRecipeLaunchOutcome | null {
  if (
    input.toolName !== T3TEAM_SIDECAR_APPLY_PERSONALIZATION_RESET_TOOL ||
    !isResetToolInput(input.toolInput)
  ) {
    return null;
  }
  persistStoredSidecarPersonalization(input.toolInput.nextPersonalization);
  return {
    applied: true,
    promptText: input.toolInput.promptText,
  };
}

export function createPendingT3TeamInlineWorkflowPrompt(
  launch: T3TeamDeterministicWorkflowLaunch,
): PendingT3TeamInlineWorkflowPrompt | null {
  const presentStep = launch.workflow.steps[0];
  const collectStep = launch.workflow.steps[1];
  const toolSteps = launch.workflow.steps.slice(2);
  const awaitedActionId =
    collectStep?.kind === "collect-input" && collectStep.request.kind === "card-action"
      ? collectStep.request.actionId
      : null;
  if (
    !presentStep ||
    presentStep.kind !== "present-message" ||
    !presentStep.message.card ||
    !collectStep ||
    collectStep.kind !== "collect-input" ||
    collectStep.request.kind !== "card-action" ||
    !awaitedActionId ||
    !presentStep.message.card.actions?.some((action) => action.id === awaitedActionId) ||
    toolSteps.length === 0 ||
    toolSteps.some(
      (step) => step.kind !== "tool" || !canRunLocalToolStep(step.toolName, step.input),
    )
  ) {
    return null;
  }

  return {
    title: launch.title,
    description: launch.description,
    workflowCard: {
      workflowRunId: `local:${launch.launchId}`,
      stepId: presentStep.id,
      phase: "updated",
      awaitingActionId: awaitedActionId,
      card: presentStep.message.card,
    },
    submitApprovedAction: async () => {
      let outcome: T3TeamInlineRecipeLaunchOutcome | null = { applied: false };
      for (const step of toolSteps) {
        if (step.kind !== "tool") {
          return null;
        }
        const stepOutcome = runLocalToolStep({ toolName: step.toolName, toolInput: step.input });
        if (!stepOutcome) {
          return null;
        }
        outcome = stepOutcome;
      }
      return outcome;
    },
  };
}
