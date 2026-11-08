/**
 * A send with a recipe attached starts that recipe instead of an agent turn. Optimistic: the chip
 * goes at once and nothing is awaited; a failure brings back the chip and the text, drops the
 * pending bubble and shows the error on the thread or draft.
 */
import { type EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import type { LaunchProjectRecipeWorkflowRequest } from "@t3tools/project-recipes";
import type { SetStateAction } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { createEnvironmentWorkflowBackend } from "~/t3team/backend/t3team-environmentWorkflowBackend";
import {
  draftComposerHome,
  draftThreadCommands,
  restoreDraftAfterFailedRecipe,
  type T3TeamDraftThreadCommands,
} from "~/t3team/composer/t3team-attachedRecipeDraftThread";
import { planAttachedRecipeStart } from "~/t3team/composer/t3team-attachedRecipeLaunchRequest";
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

export type T3TeamAttachedRecipeDeps = {
  readonly launch: T3TeamAttachedRecipeLaunch;
  readonly draftThreads: T3TeamDraftThreadCommands;
};

const DEFAULT_DEPS: T3TeamAttachedRecipeDeps = {
  launch: (environmentId, request) =>
    createEnvironmentWorkflowBackend(environmentId).launchRecipeWorkflow(request),
  draftThreads: draftThreadCommands,
};

function restoreAttachedRecipe(input: {
  readonly host: T3TeamAttachedRecipeHost;
  readonly selectedRecipe: T3TeamSelectedRecipeQuickStart;
  readonly turnStart: T3TeamComposerTurnStart;
  readonly created: ScopedThreadRef | null;
  readonly draftThreads: T3TeamDraftThreadCommands;
  readonly message: string;
}): void {
  const { host, turnStart } = input;
  const threadId = ThreadId.make(turnStart.threadId);
  host.setOptimisticUserMessages((existing) =>
    existing.filter((candidate) => candidate.id !== turnStart.messageId),
  );
  if (typeof host.target === "string") {
    restoreDraftAfterFailedRecipe({
      draftId: host.target,
      threadId,
      created: input.created,
      commands: input.draftThreads,
    });
  }
  const home = typeof host.target === "string" ? draftComposerHome(host.target) : host.target;
  if (readT3TeamComposerAttachedRecipe(home) === null) {
    attachT3TeamComposerRecipe(home, input.selectedRecipe.recipe);
  }
  const drafts = useComposerDraftStore.getState();
  if ((drafts.getComposerDraft(home)?.prompt ?? "").trim().length === 0) {
    drafts.setPrompt(home, turnStart.messageText);
  }
  host.setThreadError(threadId, input.message);
}

/**
 * Starts the attached recipe without holding the send: a draft's thread is created first, then
 * the recipe launches on it. Every failure lands in one restore.
 */
export function startAttachedRecipe(input: {
  readonly host: T3TeamAttachedRecipeHost;
  readonly selectedRecipe: T3TeamSelectedRecipeQuickStart;
  readonly turnStart: T3TeamComposerTurnStart;
  readonly deps: T3TeamAttachedRecipeDeps;
}): TurnStartOverrideResult {
  const { host, selectedRecipe, turnStart, deps } = input;
  detachT3TeamComposerRecipe(host.target);
  const restore = (message: string, created: ScopedThreadRef | null) =>
    restoreAttachedRecipe({
      host,
      selectedRecipe,
      turnStart,
      created,
      draftThreads: deps.draftThreads,
      message,
    });
  const plan = planAttachedRecipeStart(host.target, selectedRecipe.recipe, turnStart);
  if (typeof plan === "string") {
    restore(plan, null);
    return true;
  }
  let created: ScopedThreadRef | null = null;
  const createThread = plan.draft
    ? deps.draftThreads.create(plan.thread.environmentId, plan.draft.create).then(() => {
        created = plan.thread;
      })
    : Promise.resolve();
  void createThread
    .then(() => deps.launch(plan.thread.environmentId, plan.request))
    .catch((error: unknown) => {
      restore(error instanceof Error ? error.message : "The recipe could not be started.", created);
    });
  return true;
}

/** The send path's turn-start override: an attached recipe first, else the host's own override. */
export function withT3TeamAttachedRecipeTurnStart(
  host: T3TeamAttachedRecipeHost,
  deps: T3TeamAttachedRecipeDeps = DEFAULT_DEPS,
): TurnStartOverride {
  return async (turnStart) => {
    const selectedRecipe = readT3TeamComposerAttachedRecipe(host.target);
    if (selectedRecipe !== null) {
      return startAttachedRecipe({ host, selectedRecipe, turnStart, deps });
    }
    return host.hostOverride ? host.hostOverride(turnStart) : false;
  };
}
