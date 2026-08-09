/**
 * Submitting a thread composer that has an action PRESELECTED on it.
 *
 * Same contract as the kickoff composer's submit (`buildT3TeamComposerKickoff`), one step shorter:
 * the thread already exists, so the launch happens here instead of riding a kickoff through a
 * navigation. The composer's own text becomes the workflow's note input and the staged comments its
 * comment input — merged in the one place that merges them.
 *
 * The thread's opening message for the run is the human's text when they typed any, and the recipe's
 * own sentence when they just hit send. It is never sent to a model: the run's first step is the
 * deterministic `askUser`.
 */

import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { launchRecipeWorkflowOnThread } from "~/t3team/chat/t3team-launchRecipeWorkflowOnThread";
import { resolveStagedComposerActionRecipe } from "~/t3team/t3team-stagedComposerActionLaunch";
import type { T3TeamStagedComposerAction } from "~/t3team/t3team-stagedComposerActionStore";

export async function launchStagedComposerActionOnThread(input: {
  readonly backend: Pick<BackendApi, "launchRecipeWorkflow">;
  readonly threadId: string;
  readonly action: T3TeamStagedComposerAction;
  readonly composerText: string;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
}): Promise<boolean> {
  const resolved = resolveStagedComposerActionRecipe({
    action: input.action,
    composerText: input.composerText,
  });
  const workflow = resolved.recipe.workflow;
  if (!workflow?.workflowPath) {
    return false;
  }

  const note = input.composerText.trim();
  await launchRecipeWorkflowOnThread({
    backend: input.backend,
    threadId: input.threadId,
    workflow,
    kickoffMessage: note.length > 0 ? note : resolved.recipe.prompt,
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
  });
  return true;
}
