/**
 * What a kickoff composer's submit resolves to, given what is preselected on it.
 *
 * Three cases, one function, so the composer never grows a branch that a later surface forgets to
 * copy:
 *
 * 1. A STAGED action (the Description header's `Rewrite`) — merge the submit-time inputs into its
 *    workflow parameters and launch that.
 * 2. A recipe selected in the composer itself (Quick Starts card, `/alias`) — unchanged behaviour.
 * 3. Nothing preselected — a plain kickoff carrying the human's text.
 *
 * Pure, so the "what actually reaches the workflow" assertions do not need a rendered composer.
 */

import {
  buildT3TeamSelectedRecipeKickoffLaunch,
  type T3TeamSelectedRecipeQuickStart,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import { resolveStagedComposerActionRecipe } from "~/t3team/t3team-stagedComposerActionLaunch";
import type { T3TeamStagedComposerAction } from "~/t3team/t3team-stagedComposerActionStore";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

export type T3TeamStagedComposerKickoff = {
  readonly kickoffMessage: string;
  readonly kickoffPending: boolean;
  readonly workflow?: T3TeamKickoffWorkflow | undefined;
};

export function buildT3TeamComposerKickoff(input: {
  readonly stagedAction?: T3TeamStagedComposerAction | undefined;
  readonly selectedRecipe?: T3TeamSelectedRecipeQuickStart | undefined;
  readonly composerText: string;
}): T3TeamStagedComposerKickoff {
  const selectedRecipe = input.stagedAction
    ? resolveStagedComposerActionRecipe({
        action: input.stagedAction,
        composerText: input.composerText,
      })
    : input.selectedRecipe;

  if (!selectedRecipe) {
    return { kickoffMessage: input.composerText, kickoffPending: true };
  }

  const launch = buildT3TeamSelectedRecipeKickoffLaunch({
    selectedRecipe,
    customMessage: input.composerText,
  });

  return {
    kickoffMessage: launch.kickoffMessage,
    kickoffPending: launch.kickoffPending,
    ...(selectedRecipe.recipe.workflow ? { workflow: selectedRecipe.recipe.workflow } : {}),
  };
}
