import type { ProjectRecipeKickoffProgram } from "@t3tools/project-recipes";

import { buildRecipeAuthoringKickoffMessage } from "~/t3work/t3work-recipeQuickStartAuthoring";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipes";

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
    workflow: {
      ...recipe.workflow,
      parameters: Object.fromEntries(
        customization.selections.map((selection) => [selection.name, selection.value]),
      ),
    },
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

function buildRecipeKickoffLaunchFromProgram(input: {
  readonly selectedRecipe: T3workSelectedRecipeQuickStart;
  readonly customMessage?: string;
  readonly program: ProjectRecipeKickoffProgram;
}): T3workSelectedRecipeKickoffLaunch | null {
  const trimmedCustomMessage = input.customMessage?.trim();

  for (const step of input.program.steps) {
    if (step.kind === "wait-for-kickoff-input") {
      if (step.when === "always" || !trimmedCustomMessage) {
        return {
          kickoffMessage: buildRecipeAuthoringKickoffMessage({
            context: input.selectedRecipe.recipe.actionView?.context,
            promptRequest: step.promptRequest,
          }),
          kickoffPending: false,
        };
      }

      continue;
    }

    if (step.kind === "run-interactive-agent") {
      return {
        kickoffMessage: buildT3workSelectedRecipeKickoffMessage(input),
        kickoffPending: true,
      };
    }
  }

  return null;
}

export function buildT3workSelectedRecipeKickoffLaunch(input: {
  readonly selectedRecipe: T3workSelectedRecipeQuickStart;
  readonly customMessage?: string;
}): T3workSelectedRecipeKickoffLaunch {
  const kickoffFromProgram = input.selectedRecipe.recipe.workflow.kickoff
    ? buildRecipeKickoffLaunchFromProgram({
        ...input,
        program: input.selectedRecipe.recipe.workflow.kickoff,
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
