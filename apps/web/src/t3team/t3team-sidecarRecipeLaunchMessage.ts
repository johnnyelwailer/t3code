import { getBundledT3TeamRecipe } from "@t3tools/t3team-skill-packs";

import {
  type T3TeamKickoffWorkItemRef,
  buildT3TeamKickoffWorkItemParameters,
} from "~/t3team/t3team-kickoffWorkItemRef";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

type BundledRecipeWorkflow = Extract<T3TeamKickoffWorkflow, { kind: "recipe" }>;

export function buildBundledSidecarRecipeKickoffMessage(input: {
  readonly recipeId: string;
  readonly parameters?: Record<string, unknown> | undefined;
}): string {
  const recipe = getBundledT3TeamRecipe(input.recipeId);
  if (!recipe) {
    return "";
  }

  if (recipe.id === "manage-project-recipes") {
    const targetPath =
      typeof input.parameters?.targetPath === "string" && input.parameters.targetPath.length > 0
        ? input.parameters.targetPath
        : undefined;
    if (targetPath) {
      return `Edit the recipe or plugin module at ${targetPath}. Make the smallest coherent change needed, keep the current ids and structure stable, show the diff, and write it back only after the user approves.`;
    }
  }

  return recipe.promptTemplate ?? recipe.shortDescription;
}

export function withWorkItemParameters<Workflow extends BundledRecipeWorkflow>(
  workflow: Workflow,
  workItem: T3TeamKickoffWorkItemRef | undefined,
): Workflow {
  const parameters = buildT3TeamKickoffWorkItemParameters(workItem);
  if (Object.keys(parameters).length === 0) {
    return workflow;
  }
  // Explicit parameters (user customization) win over the auto-injected work item, matching the
  // bundled path; the `workItem` reference has no counterpart so it is always added.
  return { ...workflow, parameters: { ...parameters, ...workflow.parameters } };
}
