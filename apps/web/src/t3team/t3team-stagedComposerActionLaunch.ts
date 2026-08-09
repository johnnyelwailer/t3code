/**
 * Turns a staged composer action into the thing the existing launch paths already accept.
 *
 * The two channels stay separate all the way to the workflow's `Inputs`, because they mean different
 * things to the human: the staged COMMENTS are notes left on the prose (each one quoted, each one
 * individually removable) and the composer's PROMPT TEXT is the message the human is writing now.
 * Folding one into the other — prefilling the composer with a comment, or appending the composer
 * text to a comment — would lose which is which, and the workflow's confirmation card renders them
 * differently on purpose.
 *
 * Both land on `workflow.parameters` under names the STAGER chose, so this module knows nothing about
 * any particular recipe's schema and there is exactly one place that merges them.
 */

import type { T3TeamStagedComposerAction } from "~/t3team/t3team-stagedComposerActionStore";
import type { T3TeamSelectedRecipeQuickStart } from "~/t3team/t3team-recipeQuickStartLaunch";
import { toWorkflowCommentInputs } from "~/t3team/workitem/t3team-workItemDiffCommentList";

/** A staged action is only launchable as a workflow when it carries the paths the server derives the
 * run's tool scope from. Without `workflowPath` the kickoff would fall back to a plain agent turn. */
export function isStagedComposerActionLaunchable(
  action: T3TeamStagedComposerAction | undefined,
): boolean {
  return typeof action?.selectedRecipe.recipe.workflow?.workflowPath === "string";
}

export function buildStagedComposerActionParameters(input: {
  readonly action: T3TeamStagedComposerAction;
  readonly composerText: string;
}): Readonly<Record<string, unknown>> {
  const { action } = input;
  const workflow = action.selectedRecipe.recipe.workflow;
  const note = input.composerText.trim();
  const comments = toWorkflowCommentInputs(action.comments);

  return {
    ...workflow?.parameters,
    ...(action.commentsParameter && comments.length > 0
      ? { [action.commentsParameter]: comments }
      : {}),
    ...(action.composerNoteParameter && note.length > 0
      ? { [action.composerNoteParameter]: note }
      : {}),
  };
}

/**
 * The staged action with the submit-time inputs merged in, ready for
 * `buildT3TeamSelectedRecipeKickoffLaunch` (kickoff composer) or `launchRecipeWorkflow` (a composer
 * on a thread that already exists).
 */
export function resolveStagedComposerActionRecipe(input: {
  readonly action: T3TeamStagedComposerAction;
  readonly composerText: string;
}): T3TeamSelectedRecipeQuickStart {
  const { action } = input;
  const workflow = action.selectedRecipe.recipe.workflow;
  if (!workflow) {
    return action.selectedRecipe;
  }

  return {
    ...action.selectedRecipe,
    recipe: {
      ...action.selectedRecipe.recipe,
      workflow: { ...workflow, parameters: buildStagedComposerActionParameters(input) },
    },
  };
}
