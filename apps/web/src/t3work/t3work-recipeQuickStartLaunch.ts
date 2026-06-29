/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
import type { ProjectRecipeKickoffProgram } from "@t3tools/project-recipes";

import { buildRecipeAuthoringKickoffMessage } from "~/t3work/t3work-recipeQuickStartAuthoring";
import { buildT3workKickoffLaunchFromProgram } from "~/t3work/t3work-recipeKickoffProgram";
import type {
  T3workRecipeComposerGuidance,
  T3workSidecarRecipeQuickStart,
} from "~/t3work/t3work-sidecarRecipes";

export const T3WORK_RECIPE_AUTHORING_RECIPE_ID = "create-contextual-recipe";

export type T3workRecipeLaunchSelection = {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly displayValue?: string;
  readonly promptText?: string;
};

export type T3workRecipeQuickStartLaunchCustomization = {
  readonly selections: ReadonlyArray<T3workRecipeLaunchSelection>;
};

export type T3workSelectedRecipeQuickStart = {
  readonly recipe: T3workSidecarRecipeQuickStart;
  readonly customization?: T3workRecipeQuickStartLaunchCustomization;
};

export type T3workSelectedRecipeKickoffLaunch = {
  readonly kickoffMessage: string;
  readonly kickoffPending: boolean;
};

export const DEFAULT_T3WORK_SELECTED_RECIPE_HELPER_TEXT =
  "Add an optional note below, or send now.";

export const DEFAULT_T3WORK_SELECTED_RECIPE_PLACEHOLDER =
  "Add an optional note, constraint, or nuance";

function readSelectedRecipeComposerGuidance(
  selectedRecipe: T3workSelectedRecipeQuickStart,
): T3workRecipeComposerGuidance | undefined {
  return selectedRecipe.recipe.composerGuidance;
}

export function areT3workRecipeQuickStartLaunchCustomizationsEqual(
  left: T3workRecipeQuickStartLaunchCustomization | undefined,
  right: T3workRecipeQuickStartLaunchCustomization | undefined,
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
  customization: T3workRecipeQuickStartLaunchCustomization,
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

export function applyT3workRecipeQuickStartLaunchCustomization(
  recipe: T3workSidecarRecipeQuickStart,
  customization?: T3workRecipeQuickStartLaunchCustomization,
): T3workSidecarRecipeQuickStart {
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

export function buildT3workSelectedRecipeKickoffMessage(input: {
  readonly selectedRecipe: T3workSelectedRecipeQuickStart;
  readonly customMessage?: string;
}): string {
  const trimmedCustomMessage = input.customMessage?.trim();
  if (!trimmedCustomMessage) {
    return input.selectedRecipe.recipe.prompt;
  }

  return `${input.selectedRecipe.recipe.prompt}\n\nAdditional user note:\n${trimmedCustomMessage}`;
}

export function buildT3workSelectedRecipeKickoffLaunch(input: {
  readonly selectedRecipe: T3workSelectedRecipeQuickStart;
  readonly customMessage?: string;
}): T3workSelectedRecipeKickoffLaunch {
  const kickoff = input.selectedRecipe.recipe.workflow?.kickoff;
  const kickoffFromProgram = kickoff
    ? buildT3workKickoffLaunchFromProgram({
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
    kickoffMessage: buildT3workSelectedRecipeKickoffMessage(input),
    kickoffPending: true,
  };
}

export function getT3workSelectedRecipeComposerHelperText(
  selectedRecipe: T3workSelectedRecipeQuickStart,
): string {
  return (
    readSelectedRecipeComposerGuidance(selectedRecipe)?.helperText ??
    DEFAULT_T3WORK_SELECTED_RECIPE_HELPER_TEXT
  );
}

export function getT3workSelectedRecipeComposerPlaceholder(
  selectedRecipe: T3workSelectedRecipeQuickStart,
): string {
  return (
    readSelectedRecipeComposerGuidance(selectedRecipe)?.placeholder ??
    DEFAULT_T3WORK_SELECTED_RECIPE_PLACEHOLDER
  );
}

export function describeT3workSelectedRecipeQuickStart(
  selectedRecipe: T3workSelectedRecipeQuickStart,
): string | undefined {
  const selections = selectedRecipe.customization?.selections ?? [];
  if (selections.length === 0) {
    return undefined;
  }

  return selections
    .map((selection) => `${selection.label}: ${selection.displayValue ?? selection.value}`)
    .join(" • ");
}
