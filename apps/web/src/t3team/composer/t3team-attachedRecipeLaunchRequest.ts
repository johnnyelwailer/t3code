import type { ChatViewT3TeamExtensionProps } from "~/t3team/t3team-chatViewExtensions";
import type { LaunchProjectRecipeWorkflowRequest } from "@t3tools/project-recipes";

import type { ScopedThreadRef } from "@t3tools/contracts";

import { toProjectRecipeWorkflowLaunch } from "~/t3team/chat/t3team-recipeWorkflowLaunch";
import {
  planDraftRecipeThread,
  type T3TeamDraftRecipeThread,
} from "~/t3team/composer/t3team-attachedRecipeDraftThread";
import type { T3TeamComposerRecipeTarget } from "~/t3team/composer/t3team-composerAttachedRecipeStore";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

type TurnStart = Parameters<
  NonNullable<ChatViewT3TeamExtensionProps["dispatchTurnStartOverride"]>
>[0];

/**
 * The launch request for a recipe attached in the composer, or why it cannot start: the server
 * records the text under the send's own message id, so the pending bubble becomes the real one.
 */
function buildAttachedRecipeLaunchRequest(
  recipe: T3TeamSidecarRecipeQuickStart,
  turnStart: TurnStart,
): LaunchProjectRecipeWorkflowRequest | string {
  const workflow = recipe.workflow;
  if (!workflow?.workflowPath) {
    return `${recipe.title} has no workflow to run.`;
  }
  if (turnStart.hasAttachments) {
    return "A recipe starts from text only. Remove the attachments and send again.";
  }
  return {
    threadId: turnStart.threadId,
    kickoffMessage: turnStart.messageText,
    titleSeed: turnStart.titleSeed,
    createdAt: turnStart.createdAt,
    modelSelection: {
      instanceId: String(turnStart.modelSelection.instanceId),
      model: turnStart.modelSelection.model,
    },
    runtimeMode: turnStart.runtimeMode,
    interactionMode: turnStart.interactionMode,
    launch: toProjectRecipeWorkflowLaunch(workflow),
    composerKickoff: { messageId: turnStart.messageId },
  };
}

export type T3TeamAttachedRecipeStartPlan = {
  readonly thread: ScopedThreadRef;
  readonly request: LaunchProjectRecipeWorkflowRequest;
  readonly draft: T3TeamDraftRecipeThread | null;
};

/** Where and how the attached recipe starts, or why it cannot. */
export function planAttachedRecipeStart(
  target: T3TeamComposerRecipeTarget,
  recipe: T3TeamSidecarRecipeQuickStart,
  turnStart: TurnStart,
): T3TeamAttachedRecipeStartPlan | string {
  const request = buildAttachedRecipeLaunchRequest(recipe, turnStart);
  if (typeof request === "string") return request;
  if (typeof target !== "string") return { thread: target, request, draft: null };
  const draft = planDraftRecipeThread(target, turnStart);
  return typeof draft === "string" ? draft : { thread: draft.thread, request, draft };
}
