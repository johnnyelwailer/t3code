/**
 * Starts an attached recipe's run on send. Not built yet: answers `false`, so the message goes out
 * as an ordinary turn and the chip stays. The launch replaces this body.
 */
import type {
  ChatViewT3TeamExtensionProps,
  TurnStartOverrideResult,
} from "~/t3team/t3team-chatViewExtensions";
import {
  readT3TeamComposerAttachedRecipe,
  type T3TeamComposerRecipeTarget,
} from "~/t3team/composer/t3team-composerAttachedRecipeStore";
import type { T3TeamSelectedRecipeQuickStart } from "~/t3team/t3team-recipeQuickStartLaunch";

type TurnStartOverride = NonNullable<ChatViewT3TeamExtensionProps["dispatchTurnStartOverride"]>;
export type T3TeamComposerTurnStart = Parameters<TurnStartOverride>[0];

export type T3TeamAttachedRecipeStartInput = {
  readonly target: T3TeamComposerRecipeTarget;
  readonly selectedRecipe: T3TeamSelectedRecipeQuickStart;
  readonly turnStart: T3TeamComposerTurnStart;
};

export function startAttachedRecipe(
  _input: T3TeamAttachedRecipeStartInput,
): Promise<TurnStartOverrideResult> {
  return Promise.resolve(false);
}

/**
 * The send path's turn-start override for one composer: the attached recipe first, then the
 * host's own override. Reads the store at send time, so attaching never re-renders the view.
 */
export function withT3TeamAttachedRecipeTurnStart(
  target: T3TeamComposerRecipeTarget,
  hostOverride: TurnStartOverride | undefined,
): TurnStartOverride {
  return async (turnStart) => {
    const selectedRecipe = readT3TeamComposerAttachedRecipe(target);
    if (selectedRecipe !== null) {
      const result = await startAttachedRecipe({ target, selectedRecipe, turnStart });
      if (result !== false) return result;
    }
    return hostOverride ? hostOverride(turnStart) : false;
  };
}
