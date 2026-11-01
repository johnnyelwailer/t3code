import type { RecipeSurface } from "@t3tools/project-recipes";
import { getBundledT3TeamRecipe } from "@t3tools/t3team-skill-packs";

import { runThreadBootstrapKickoff } from "~/t3team/chat/t3team-runThreadBootstrapKickoff";
import type { BackendApi } from "~/t3team/backend/t3team-types";
import { WORKFLOW_BACKED_BUNDLED_RECIPE_IDS } from "~/t3team/t3team-bundledRecipeWorkflowIds";
import type { T3TeamKickoffLaunchConfig } from "~/t3team/t3team-kickoffLaunchConfig";
import {
  applyT3TeamRecipeQuickStartLaunchCustomization,
  type T3TeamRecipeQuickStartLaunchCustomization,
} from "~/t3team/t3team-recipeQuickStartLaunch";
import {
  type T3TeamKickoffWorkItemRef,
  buildT3TeamKickoffWorkItemParameters,
} from "~/t3team/t3team-kickoffWorkItemRef";
import {
  buildBundledSidecarRecipeKickoffMessage,
  withWorkItemParameters,
} from "~/t3team/t3team-sidecarRecipeLaunchMessage";
import {
  buildSidecarLaunchToolContext,
  type SidecarLaunchToolContextSource,
} from "~/t3team/t3team-sidecarLaunchToolContext";
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
  readonly toolContextSource?: SidecarLaunchToolContextSource | undefined;
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
    // The surface's own context, so the launch's tool-context sync does not clear the thread's.
    toolContext: input.toolContextSource
      ? buildSidecarLaunchToolContext({
          source: input.toolContextSource,
          threadId,
          title: input.title,
          kickoffMessage: input.kickoffMessage,
          kickoffWorkflow: kickoffWorkflow ?? undefined,
          selectedToolIds: input.launchConfig.selectedToolIds,
        })
      : undefined,
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
  readonly workItem?: T3TeamKickoffWorkItemRef;
  readonly launchConfig: T3TeamKickoffLaunchConfig;
  readonly createThread: CreateSidecarRecipeThread;
  readonly toolContextSource?: SidecarLaunchToolContextSource;
}): Promise<boolean> {
  const recipe = getBundledT3TeamRecipe(input.recipeId);
  if (!recipe) {
    return false;
  }
  const parameters = {
    ...buildT3TeamKickoffWorkItemParameters(input.workItem),
    ...input.parameters,
  };
  const hasParameters = Object.keys(parameters).length > 0;
  return launchSidecarRecipeThread({
    backend: input.backend,
    environmentId: input.environmentId,
    projectId: input.projectId,
    title: recipe.title,
    kickoffMessage: buildBundledSidecarRecipeKickoffMessage({
      recipeId: input.recipeId,
      ...(hasParameters ? { parameters } : {}),
    }),
    kickoffWorkflow: buildBundledSidecarRecipeWorkflowLaunch({
      recipeId: input.recipeId,
      surface: input.surface,
      projectWorkspaceRoot: input.projectWorkspaceRoot,
      ...(hasParameters ? { parameters } : {}),
    }),
    launchConfig: input.launchConfig,
    createThread: input.createThread,
    toolContextSource: input.toolContextSource,
  });
}

/**
 * A discovered quick start, sent on click. Workflow-backed recipes start their workflow on the new
 * thread; prompt-backed ones send their prompt as the thread's pending first message. Either way the
 * thread is created and the prompt reaches the model with no extra Submit — the Quick Start card's
 * body click and the RunToggle's "on" both route through here.
 */
export async function launchSidecarRecipeQuickStartThread(input: {
  readonly backend: BackendApi | null | undefined;
  readonly environmentId: string | null | undefined;
  readonly projectId: string;
  readonly quickStart: T3TeamSidecarRecipeQuickStart;
  readonly customization?: T3TeamRecipeQuickStartLaunchCustomization;
  readonly launchConfig: T3TeamKickoffLaunchConfig;
  readonly workItem?: T3TeamKickoffWorkItemRef;
  readonly createThread: CreateSidecarRecipeThread;
  readonly toolContextSource?: SidecarLaunchToolContextSource;
}): Promise<boolean> {
  const recipe = input.customization
    ? applyT3TeamRecipeQuickStartLaunchCustomization(input.quickStart, input.customization)
    : input.quickStart;
  const workflow = recipe.workflow;
  const recipeWorkflow = workflow && workflow.kind === "recipe" ? workflow : null;
  return launchSidecarRecipeThread({
    backend: input.backend,
    environmentId: input.environmentId,
    projectId: input.projectId,
    title: recipe.title,
    kickoffMessage: recipe.prompt,
    kickoffWorkflow: recipeWorkflow ? withWorkItemParameters(recipeWorkflow, input.workItem) : null,
    launchConfig: input.launchConfig,
    createThread: input.createThread,
    toolContextSource: input.toolContextSource,
  });
}
