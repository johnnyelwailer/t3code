import { useMemo } from "react";
import { matchRecipes } from "@t3tools/project-recipes";
import {
  getBundledT3TeamRecipe,
  getT3TeamProfile,
  listBundledT3TeamRecipes,
  offeredBundledRecipes,
  resolveEnabledSkillPackIds,
  toRecipeProfileContext,
} from "@t3tools/t3team-skill-packs";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { buildT3TeamActionRecipeLaunchContext } from "~/t3team/t3team-actionRecipeLaunchContext";
import { WORKFLOW_BACKED_BUNDLED_RECIPE_IDS } from "~/t3team/t3team-bundledRecipeWorkflowIds";
import { useOfferedRecipes } from "~/t3team/t3team-offeredRecipes";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";
import { buildAvailableContextKeys } from "~/t3team/t3team-sidecarRecipeContextKeys";
import { buildPinnedQuickStartSelection } from "~/t3team/t3team-sidecarRecipeDiscoveryMapping";
import {
  buildProjectRecipeDiscoveryRequest,
  buildRecipeRenderContext,
} from "~/t3team/t3team-sidecarRecipeRenderContext";
import {
  buildBundledRecipeTemplateValues,
  renderPromptTemplate,
} from "~/t3team/t3team-sidecarRecipeTemplates";
import { buildT3TeamSidecarRecipeMembershipKey } from "~/t3team/t3team-sidecarRecipeInputKey";
import { type RecipeDiscoveryStatus, useRecipeDiscovery } from "~/t3team/t3team-useRecipeDiscovery";
import type {
  T3TeamSidecarRecipeInput,
  T3TeamSidecarRecipeQuickStart,
} from "~/t3team/t3team-sidecarRecipeTypes";

export type {
  T3TeamRecipeComposerGuidance,
  T3TeamSidecarRecipeActionView,
  T3TeamSidecarRecipeLinkedResource,
  T3TeamSidecarRecipeQuickStart,
  T3TeamSidecarRecipeTicketContext,
  T3TeamSidecarRecipeTicketGitHubSummary,
  T3TeamSidecarRecipeTicketRelationships,
} from "~/t3team/t3team-sidecarRecipeTypes";

export { buildProjectRecipeDiscoveryRequest } from "~/t3team/t3team-sidecarRecipeRenderContext";

/** `bundledExamples` is the `BUNDLED_RECIPE_EXAMPLES` flag; off (the default) keeps only the authoring entry. */
export function buildT3TeamSidecarRecipeQuickStarts(
  input: T3TeamSidecarRecipeInput,
  bundledExamples = false,
): ReadonlyArray<T3TeamSidecarRecipeQuickStart> {
  const profile = getT3TeamProfile(input.profileId);
  const enabledSkillPacks = resolveEnabledSkillPackIds({ profile });
  const renderContext = buildRecipeRenderContext(input, profile);
  const resolvedSurface = renderContext.surface;
  const projectWorkspaceRoot = input.project.workspace?.rootPath;
  const availableContextKeys = buildAvailableContextKeys(input);
  const templateValues = buildBundledRecipeTemplateValues(input);
  const launchContext = buildT3TeamActionRecipeLaunchContext(renderContext);
  const matches = matchRecipes(offeredBundledRecipes(listBundledT3TeamRecipes(), bundledExamples), {
    activeProject: input.project,
    selectedResource: null,
    resourceKind: input.resourceKind ?? null,
    availableIntegrations: [
      ...new Set([input.project.source.provider, ...(input.availableIntegrations ?? [])]),
    ],
    surface: resolvedSurface,
    ...(input.jiraIssueType ? { jiraIssueType: input.jiraIssueType } : {}),
    enabledSkillPacks,
    profile: toRecipeProfileContext(profile),
    availableContextKeys,
    renderContext,
  }).filter((result) => result.missingContext.length === 0);

  return buildPinnedQuickStartSelection(matches, input.limit ?? 5).map((result) => {
    const bundledRecipe = getBundledT3TeamRecipe(result.recipe.id);
    const localBundledRecipePath =
      WORKFLOW_BACKED_BUNDLED_RECIPE_IDS.has(result.recipe.id) && projectWorkspaceRoot
        ? `${projectWorkspaceRoot}/.t3team/recipes/${result.recipe.id}`
        : undefined;
    const renderedTitle = renderPromptTemplate(
      bundledRecipe?.manifestDisplayName ?? result.recipe.title,
      templateValues,
    );
    const renderedDescription = renderPromptTemplate(
      result.recipe.shortDescription,
      templateValues,
    );
    const renderedPrompt = renderPromptTemplate(
      result.recipe.promptTemplate ?? result.recipe.shortDescription,
      templateValues,
    );

    const workflow = localBundledRecipePath
      ? {
          kind: "recipe" as const,
          recipeId: result.recipe.id,
          ...(bundledRecipe?.version ? { recipeVersion: bundledRecipe.version } : {}),
          title: renderedTitle,
          description: renderedDescription,
          source: "bundled" as const,
          surface: resolvedSurface,
          reason: result.reason,
          launchContext,
          recipePath: localBundledRecipePath,
          workflowPath: `${localBundledRecipePath}/workflow.ts`,
          ...(bundledRecipe?.allowedToolGroups
            ? { allowedToolGroups: bundledRecipe.allowedToolGroups }
            : {}),
        }
      : undefined;

    const quickStart: T3TeamSidecarRecipeQuickStart = {
      id: result.recipe.id,
      title: renderedTitle,
      description: renderedDescription,
      prompt: renderedPrompt,
      ...(result.recipe.slashAlias ? { slashAlias: result.recipe.slashAlias } : {}),
      ...(workflow ? { workflow } : {}),
    };

    if (bundledRecipe?.composerGuidance) {
      Object.assign(quickStart, {
        composerGuidance: bundledRecipe.composerGuidance,
      });
    }

    return bundledRecipe?.actionViewTemplate
      ? Object.assign(quickStart, {
          actionView: {
            source: renderPromptTemplate(bundledRecipe.actionViewTemplate, templateValues),
            context: renderContext,
          },
        })
      : quickStart;
  });
}

export function useT3TeamSidecarRecipeDiscovery(
  input: T3TeamSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  },
): {
  readonly quickStarts: ReadonlyArray<T3TeamSidecarRecipeQuickStart>;
  readonly status: RecipeDiscoveryStatus;
} {
  const membershipKey = buildT3TeamSidecarRecipeMembershipKey(input);
  const bundledExamples = useFeatureFlag("BUNDLED_RECIPE_EXAMPLES");
  const fallbackQuickStarts = useMemo(
    () => buildT3TeamSidecarRecipeQuickStarts(input, bundledExamples),
    [membershipKey, bundledExamples],
  );
  const workspaceRoot = input.project.workspace?.rootPath;
  const discoveryRequest = useMemo(
    () =>
      workspaceRoot
        ? buildProjectRecipeDiscoveryRequest({
            ...input,
            workspaceRoot,
          })
        : null,
    [membershipKey, workspaceRoot],
  );
  const { quickStarts, status } = useRecipeDiscovery({
    backend: input.backend,
    discoveryRequest,
    fallbackQuickStarts,
    limit: input.limit,
  });
  return { quickStarts: useOfferedRecipes(quickStarts), status };
}

export function useT3TeamSidecarRecipeQuickStarts(
  input: T3TeamSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  },
): ReadonlyArray<T3TeamSidecarRecipeQuickStart> {
  return useT3TeamSidecarRecipeDiscovery(input).quickStarts;
}
