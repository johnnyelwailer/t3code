import type { RecipeSurface } from "@t3tools/project-recipes";
import { getBundledT3TeamRecipe } from "@t3tools/t3team-skill-packs";

import { runThreadBootstrapKickoff } from "~/t3team/chat/t3team-runThreadBootstrapKickoff";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { WORKFLOW_BACKED_BUNDLED_RECIPE_IDS } from "~/t3team/t3team-bundledRecipeWorkflowIds";
import type { T3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

export type BundledRecipeWorkflow = Extract<T3TeamKickoffWorkflow, { kind: "recipe" }>;

export function buildBundledSidecarRecipeWorkflowLaunch(input: {
  readonly recipeId: string;
  readonly surface: RecipeSurface;
  readonly projectWorkspaceRoot?: string | undefined;
  readonly parameters?: Record<string, unknown> | undefined;
}): BundledRecipeWorkflow | null {
  const recipe = getBundledT3TeamRecipe(input.recipeId);
  if (!recipe) {
    return null;
  }

  if (!WORKFLOW_BACKED_BUNDLED_RECIPE_IDS.has(recipe.id) || !input.projectWorkspaceRoot) {
    return null;
  }
  const recipePath = `${input.projectWorkspaceRoot}/.t3team/recipes/${recipe.id}`;

  return {
    kind: "recipe",
    recipeId: recipe.id,
    ...(recipe.version ? { recipeVersion: recipe.version } : {}),
    ...(input.parameters ? { parameters: input.parameters } : {}),
    title: recipe.title,
    description: recipe.shortDescription,
    source: "bundled",
    surface: input.surface,
    ...(recipePath ? { recipePath } : {}),
    ...(recipePath ? { workflowPath: `${recipePath}/workflow.ts` } : {}),
    ...(recipe.allowedToolGroups ? { allowedToolGroups: recipe.allowedToolGroups } : {}),
  };
}

export function buildBundledSidecarRecipeKickoffMessage(input: {
  readonly recipeId: string;
  readonly parameters?: Record<string, unknown> | undefined;
}): string {
  const recipe = getBundledT3TeamRecipe(input.recipeId);
  if (!recipe) {
    return "";
  }

  if (recipe.id === "edit-plugin-module") {
    const targetPath =
      typeof input.parameters?.targetPath === "string" && input.parameters.targetPath.length > 0
        ? input.parameters.targetPath
        : "the selected item";
    return `Edit ${targetPath}. Make the smallest coherent change needed and keep the current module shape unless the request changes it.`;
  }

  return recipe.promptTemplate ?? recipe.shortDescription;
}

export async function launchBundledSidecarRecipeThread(input: {
  readonly backend: BackendApi | null | undefined;
  readonly environmentId: string | null | undefined;
  readonly projectId: string;
  readonly surface: RecipeSurface;
  readonly projectWorkspaceRoot?: string | undefined;
  readonly recipeId: string;
  readonly parameters?: Record<string, unknown> | undefined;
  readonly launchConfig: T3TeamKickoffLaunchConfig;
  readonly createThread: (input: {
    kickoffMessage: string;
    kickoffWorkflow: BundledRecipeWorkflow;
    launchConfig: T3TeamKickoffLaunchConfig;
  }) => unknown | Promise<unknown>;
}): Promise<boolean> {
  if (!input.backend || !input.environmentId) {
    return false;
  }

  const kickoffWorkflow = buildBundledSidecarRecipeWorkflowLaunch({
    recipeId: input.recipeId,
    surface: input.surface,
    projectWorkspaceRoot: input.projectWorkspaceRoot,
    ...(input.parameters ? { parameters: input.parameters } : {}),
  });
  if (!kickoffWorkflow) {
    return false;
  }

  const kickoffMessage = buildBundledSidecarRecipeKickoffMessage({
    recipeId: input.recipeId,
    ...(input.parameters ? { parameters: input.parameters } : {}),
  });
  const threadId = await input.createThread({
    kickoffMessage,
    kickoffWorkflow,
    launchConfig: input.launchConfig,
  });
  if (typeof threadId !== "string" || threadId.length === 0) {
    return false;
  }

  await runThreadBootstrapKickoff({
    backend: input.backend,
    action: "kickoff",
    state: {
      threadId,
      projectEnsured: true,
      threadCreateSent: false,
      kickoffSent: false,
    },
    environmentId: input.environmentId,
    threadId,
    canonicalProjectId: input.projectId,
    title: kickoffWorkflow.title,
    initialUserMessage: kickoffMessage,
    kickoffModelSelection: input.launchConfig.selection,
    kickoffRuntimeMode: input.launchConfig.runtimeMode,
    kickoffInteractionMode: input.launchConfig.interactionMode,
    kickoffBranch: null,
    kickoffWorkflow,
    toolContext: undefined,
    createdAt: new Date().toISOString(),
    onInitialUserMessageSent: undefined,
  });

  return true;
}
