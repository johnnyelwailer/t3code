import type { RecipeSurface } from "@t3tools/project-recipes";
import { getBundledT3TeamRecipe } from "@t3tools/t3team-skill-packs";

import { runThreadBootstrapKickoff } from "~/t3team/chat/t3team-runThreadBootstrapKickoff";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { WORKFLOW_BACKED_BUNDLED_RECIPE_IDS } from "~/t3team/t3team-bundledRecipeWorkflowIds";
import type { T3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
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

type CreateSidecarRecipeThread = (input: {
  kickoffMessage: string;
  kickoffWorkflow?: BundledRecipeWorkflow;
  launchConfig: T3TeamKickoffLaunchConfig;
}) => unknown | Promise<unknown>;

/**
 * Creates the thread through the host's composer path, then runs the bootstrap kickoff that
 * launches the workflow on it. The one way a sidecar card starts a recipe thread: there is no
 * headless launch, and the launch route needs the thread, the model and the recipe paths.
 */
async function launchSidecarRecipeThread(input: {
  readonly backend: BackendApi | null | undefined;
  readonly environmentId: string | null | undefined;
  readonly projectId: string;
  readonly title: string;
  readonly kickoffMessage: string;
  readonly kickoffWorkflow: BundledRecipeWorkflow | null;
  readonly launchConfig: T3TeamKickoffLaunchConfig;
  readonly createThread: CreateSidecarRecipeThread;
}): Promise<boolean> {
  if (!input.backend || !input.environmentId) {
    return false;
  }
  const kickoffWorkflow = input.kickoffWorkflow;
  const threadId = await input.createThread({
    kickoffMessage: input.kickoffMessage,
    ...(kickoffWorkflow ? { kickoffWorkflow } : {}),
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
      dispatchedBranch: undefined,
      branchBackfillSent: false,
    },
    environmentId: input.environmentId,
    threadId,
    canonicalProjectId: input.projectId,
    title: input.title,
    initialUserMessage: input.kickoffMessage,
    kickoffModelSelection: input.launchConfig.selection,
    kickoffRuntimeMode: input.launchConfig.runtimeMode,
    kickoffInteractionMode: input.launchConfig.interactionMode,
    kickoffBranch: null,
    kickoffWorkflow: kickoffWorkflow ?? undefined,
    toolContext: undefined,
    createdAt: new Date().toISOString(),
    onInitialUserMessageSent: undefined,
  });

  return true;
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
  readonly createThread: CreateSidecarRecipeThread;
}): Promise<boolean> {
  const recipe = getBundledT3TeamRecipe(input.recipeId);
  if (!recipe) {
    return false;
  }
  return launchSidecarRecipeThread({
    backend: input.backend,
    environmentId: input.environmentId,
    projectId: input.projectId,
    title: recipe.title,
    kickoffMessage: buildBundledSidecarRecipeKickoffMessage({
      recipeId: input.recipeId,
      ...(input.parameters ? { parameters: input.parameters } : {}),
    }),
    kickoffWorkflow: buildBundledSidecarRecipeWorkflowLaunch({
      recipeId: input.recipeId,
      surface: input.surface,
      projectWorkspaceRoot: input.projectWorkspaceRoot,
      ...(input.parameters ? { parameters: input.parameters } : {}),
    }),
    launchConfig: input.launchConfig,
    createThread: input.createThread,
  });
}

/** A discovered (project or pack) quick start with a workflow: the RunToggle card's "on". */
export async function launchSidecarRecipeQuickStartThread(input: {
  readonly backend: BackendApi | null | undefined;
  readonly environmentId: string | null | undefined;
  readonly projectId: string;
  readonly quickStart: Pick<T3TeamSidecarRecipeQuickStart, "title" | "prompt" | "workflow">;
  readonly launchConfig: T3TeamKickoffLaunchConfig;
  readonly createThread: CreateSidecarRecipeThread;
}): Promise<boolean> {
  const workflow = input.quickStart.workflow;
  if (workflow?.kind !== "recipe" || !workflow.workflowPath) {
    return false;
  }
  return launchSidecarRecipeThread({
    backend: input.backend,
    environmentId: input.environmentId,
    projectId: input.projectId,
    title: input.quickStart.title,
    kickoffMessage: input.quickStart.prompt,
    kickoffWorkflow: workflow,
    launchConfig: input.launchConfig,
    createThread: input.createThread,
  });
}
