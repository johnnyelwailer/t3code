/**
 * A send with a recipe attached starts that recipe instead of an agent turn. Optimistic: the chip
 * goes at once and the request is not awaited; a failure brings back the chip and the text, drops
 * the pending bubble and shows the error on the thread.
 */
import { type EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import type { LaunchProjectRecipeWorkflowRequest } from "@t3tools/project-recipes";
import type { SetStateAction } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { createEnvironmentWorkflowBackend } from "~/t3team/backend/t3team-environmentWorkflowBackend";
import { buildAttachedRecipeLaunchRequest } from "~/t3team/composer/t3team-attachedRecipeLaunchRequest";
import {
  attachT3TeamComposerRecipe,
  detachT3TeamComposerRecipe,
  readT3TeamComposerAttachedRecipe,
  type T3TeamComposerRecipeTarget,
} from "~/t3team/composer/t3team-composerAttachedRecipeStore";
import type {
  ChatViewT3TeamExtensionProps,
  TurnStartOverrideResult,
} from "~/t3team/t3team-chatViewExtensions";
import type { T3TeamSelectedRecipeQuickStart } from "~/t3team/t3team-recipeQuickStartLaunch";
import type { ChatMessage } from "~/types";

type TurnStartOverride = NonNullable<ChatViewT3TeamExtensionProps["dispatchTurnStartOverride"]>;
export type T3TeamComposerTurnStart = Parameters<TurnStartOverride>[0];

export type T3TeamAttachedRecipeLaunch = (
  environmentId: EnvironmentId,
  request: LaunchProjectRecipeWorkflowRequest,
) => Promise<unknown>;

/** What the hosting ChatView lends the launch to undo its optimistic send. */
export type T3TeamAttachedRecipeHost = {
  readonly target: T3TeamComposerRecipeTarget;
  readonly hostOverride: TurnStartOverride | undefined;
  readonly setOptimisticUserMessages: (action: SetStateAction<ChatMessage[]>) => void;
  readonly setThreadError: (threadId: ThreadId | null, error: string | null) => void;
};

const launchOnEnvironment: T3TeamAttachedRecipeLaunch = (environmentId, request) =>
  createEnvironmentWorkflowBackend(environmentId).launchRecipeWorkflow(request);

function restoreAttachedRecipe(
  host: T3TeamAttachedRecipeHost,
  selectedRecipe: T3TeamSelectedRecipeQuickStart,
  turnStart: T3TeamComposerTurnStart,
  message: string,
): void {
  host.setOptimisticUserMessages((existing) =>
    existing.filter((candidate) => candidate.id !== turnStart.messageId),
  );
  if (readT3TeamComposerAttachedRecipe(host.target) === null) {
    attachT3TeamComposerRecipe(host.target, selectedRecipe.recipe);
  }
  const drafts = useComposerDraftStore.getState();
  if ((drafts.getComposerDraft(host.target)?.prompt ?? "").trim().length === 0) {
    drafts.setPrompt(host.target, turnStart.messageText);
  }
  host.setThreadError(ThreadId.make(turnStart.threadId), message);
}

export function startAttachedRecipe(input: {
  readonly host: T3TeamAttachedRecipeHost;
  readonly thread: ScopedThreadRef;
  readonly selectedRecipe: T3TeamSelectedRecipeQuickStart;
  readonly turnStart: T3TeamComposerTurnStart;
  readonly launch: T3TeamAttachedRecipeLaunch;
}): TurnStartOverrideResult {
  const { host, selectedRecipe, turnStart } = input;
  detachT3TeamComposerRecipe(host.target);
  const request = buildAttachedRecipeLaunchRequest(selectedRecipe.recipe, turnStart);
  if (typeof request === "string") {
    restoreAttachedRecipe(host, selectedRecipe, turnStart, request);
    return true;
  }
  void input.launch(input.thread.environmentId, request).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : "The recipe could not be started.";
    restoreAttachedRecipe(host, selectedRecipe, turnStart, reason);
  });
  return true;
}

/** The send path's turn-start override: an attached recipe first, else the host's own override. */
export function withT3TeamAttachedRecipeTurnStart(
  host: T3TeamAttachedRecipeHost,
  launch: T3TeamAttachedRecipeLaunch = launchOnEnvironment,
): TurnStartOverride {
  return async (turnStart) => {
    const selectedRecipe = readT3TeamComposerAttachedRecipe(host.target);
    if (selectedRecipe !== null && typeof host.target !== "string") {
      return startAttachedRecipe({ host, thread: host.target, selectedRecipe, turnStart, launch });
    }
    return host.hostOverride ? host.hostOverride(turnStart) : false;
  };
}
