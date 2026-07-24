/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { ProjectRecipeKickoffProgram } from "@t3tools/project-recipes";

import { buildRecipeAuthoringKickoffMessage } from "~/t3team/t3team-recipeQuickStartAuthoring";
import { buildT3TeamKickoffLaunchFromProgram } from "~/t3team/t3team-recipeKickoffProgram";
import type {
  T3TeamRecipeComposerGuidance,
  T3TeamSidecarRecipeQuickStart,
} from "~/t3team/t3team-sidecarRecipes";

export const T3TEAM_RECIPE_AUTHORING_RECIPE_ID = "create-contextual-recipe";

export type T3TeamRecipeLaunchSelection = {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly displayValue?: string;
  readonly promptText?: string;
};

export type T3TeamRecipeQuickStartLaunchCustomization = {
  readonly selections: ReadonlyArray<T3TeamRecipeLaunchSelection>;
};

export type T3TeamSelectedRecipeQuickStart = {
  readonly recipe: T3TeamSidecarRecipeQuickStart;
  readonly customization?: T3TeamRecipeQuickStartLaunchCustomization;
};

export type T3TeamSelectedRecipeKickoffLaunch = {
  readonly kickoffMessage: string;
  readonly kickoffPending: boolean;
};

export const DEFAULT_T3TEAM_SELECTED_RECIPE_HELPER_TEXT =
  "Add an optional note below, or send now.";

export const DEFAULT_T3TEAM_SELECTED_RECIPE_PLACEHOLDER =
  "Add an optional note, constraint, or nuance";

function readSelectedRecipeComposerGuidance(
  selectedRecipe: T3TeamSelectedRecipeQuickStart,
): T3TeamRecipeComposerGuidance | undefined {
  return selectedRecipe.recipe.composerGuidance;
}

export function areT3TeamRecipeQuickStartLaunchCustomizationsEqual(
  left: T3TeamRecipeQuickStartLaunchCustomization | undefined,
  right: T3TeamRecipeQuickStartLaunchCustomization | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (left.selections.length !== right.selections.length) {
    return false;
  }

  return left.selections.every((selection, index) => {
    const other = right.selections[index];
    return (
      selection.name === other?.name &&
      selection.label === other?.label &&
      selection.value === other?.value &&
      selection.displayValue === other?.displayValue &&
      selection.promptText === other?.promptText
    );
  });
}

function buildCustomizedPrompt(
  prompt: string,
  customization: T3TeamRecipeQuickStartLaunchCustomization,
): string {
  if (customization.selections.length === 0) {
    return prompt;
  }

  const lines = customization.selections.map((selection) => {
    if (selection.promptText?.trim()) {
      return selection.promptText.trim();
    }

    return `${selection.label}: ${selection.displayValue ?? selection.value}`;
  });

  return `${prompt}\n\nAdditional launch guidance:\n- ${lines.join("\n- ")}`;
}

export function applyT3TeamRecipeQuickStartLaunchCustomization(
  recipe: T3TeamSidecarRecipeQuickStart,
  customization?: T3TeamRecipeQuickStartLaunchCustomization,
): T3TeamSidecarRecipeQuickStart {
  if (!customization || customization.selections.length === 0) {
    return recipe;
  }

  return {
    ...recipe,
    prompt: buildCustomizedPrompt(recipe.prompt, customization),
    ...(recipe.workflow
      ? {
          workflow: {
            ...recipe.workflow,
            parameters: Object.fromEntries(
              customization.selections.map((selection) => [selection.name, selection.value]),
            ),
          },
        }
      : {}),
  };
}

export function buildT3TeamSelectedRecipeKickoffMessage(input: {
  readonly selectedRecipe: T3TeamSelectedRecipeQuickStart;
  readonly customMessage?: string;
}): string {
  const trimmedCustomMessage = input.customMessage?.trim();
  if (!trimmedCustomMessage) {
    return input.selectedRecipe.recipe.prompt;
  }

  return `${input.selectedRecipe.recipe.prompt}\n\nAdditional user note:\n${trimmedCustomMessage}`;
}

export function buildT3TeamSelectedRecipeKickoffLaunch(input: {
  readonly selectedRecipe: T3TeamSelectedRecipeQuickStart;
  readonly customMessage?: string;
}): T3TeamSelectedRecipeKickoffLaunch {
  const kickoff = input.selectedRecipe.recipe.workflow?.kickoff;
  const kickoffFromProgram = kickoff
    ? buildT3TeamKickoffLaunchFromProgram({
        program: kickoff,
        prompt: input.selectedRecipe.recipe.prompt,
        ...(input.customMessage !== undefined ? { customMessage: input.customMessage } : {}),
        context: input.selectedRecipe.recipe.actionView?.context,
      })
    : null;

  if (kickoffFromProgram) {
    return kickoffFromProgram;
  }

  return {
    kickoffMessage: buildT3TeamSelectedRecipeKickoffMessage(input),
    kickoffPending: true,
  };
}

export function getT3TeamSelectedRecipeComposerHelperText(
  selectedRecipe: T3TeamSelectedRecipeQuickStart,
): string {
  return (
    readSelectedRecipeComposerGuidance(selectedRecipe)?.helperText ??
    DEFAULT_T3TEAM_SELECTED_RECIPE_HELPER_TEXT
  );
}

export function getT3TeamSelectedRecipeComposerPlaceholder(
  selectedRecipe: T3TeamSelectedRecipeQuickStart,
): string {
  return (
    readSelectedRecipeComposerGuidance(selectedRecipe)?.placeholder ??
    DEFAULT_T3TEAM_SELECTED_RECIPE_PLACEHOLDER
  );
}

export function describeT3TeamSelectedRecipeQuickStart(
  selectedRecipe: T3TeamSelectedRecipeQuickStart,
): string | undefined {
  const selections = selectedRecipe.customization?.selections ?? [];
  if (selections.length === 0) {
    return undefined;
  }

  return selections
    .map((selection) => `${selection.label}: ${selection.displayValue ?? selection.value}`)
    .join(" • ");
}
