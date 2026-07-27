import { useEffect, useMemo, useState } from "react";
import { matchRecipes } from "@t3tools/project-recipes";
import {
  getBundledT3TeamRecipe,
  getT3TeamProfile,
  listBundledT3TeamRecipes,
  resolveEnabledSkillPackIds,
  toRecipeProfileContext,
} from "@t3tools/t3team-skill-packs";

import type { BackendApi } from "~/t3team/backend/t3team-types";
import { buildT3TeamActionRecipeLaunchContext } from "~/t3team/t3team-actionRecipeLaunchContext";
import { buildAvailableContextKeys } from "~/t3team/t3team-sidecarRecipeContextKeys";
import {
  buildPinnedQuickStartSelection,
  mergeSidecarRecipeQuickStarts,
  mapDiscoveredRecipesToQuickStarts,
} from "~/t3team/t3team-sidecarRecipeDiscoveryMapping";
import {
  buildProjectRecipeDiscoveryRequest,
  buildRecipeRenderContext,
} from "~/t3team/t3team-sidecarRecipeRenderContext";
import {
  buildBundledRecipeTemplateValues,
  renderPromptTemplate,
} from "~/t3team/t3team-sidecarRecipeTemplates";
import { buildT3TeamSidecarRecipeMembershipKey } from "~/t3team/t3team-sidecarRecipeInputKey";
import { areQuickStartsEqual } from "~/t3team/t3team-sidecarRecipeQuickStartEquality";
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

export function buildT3TeamSidecarRecipeQuickStarts(
  input: T3TeamSidecarRecipeInput,
): ReadonlyArray<T3TeamSidecarRecipeQuickStart> {
  const profile = getT3TeamProfile(input.profileId);
  const enabledSkillPacks = resolveEnabledSkillPackIds({ profile });
  const renderContext = buildRecipeRenderContext(input, profile);
  const resolvedSurface = renderContext.surface;
  const projectWorkspaceRoot = input.project.workspace?.rootPath;
  const availableContextKeys = buildAvailableContextKeys(input);
  const templateValues = buildBundledRecipeTemplateValues(input);
  const launchContext = buildT3TeamActionRecipeLaunchContext(renderContext);
  const matches = matchRecipes(listBundledT3TeamRecipes(), {
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
      result.recipe.id === "create-recipe" && projectWorkspaceRoot
        ? `${projectWorkspaceRoot}/.t3team/recipes/create-recipe`
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

export function useT3TeamSidecarRecipeQuickStarts(
  input: T3TeamSidecarRecipeInput & {
    readonly backend: BackendApi | null;
  },
): ReadonlyArray<T3TeamSidecarRecipeQuickStart> {
  const membershipKey = buildT3TeamSidecarRecipeMembershipKey(input);
  const fallbackQuickStarts = useMemo(
    () => buildT3TeamSidecarRecipeQuickStarts(input),
    [membershipKey],
  );
  const [quickStarts, setQuickStarts] =
    useState<ReadonlyArray<T3TeamSidecarRecipeQuickStart>>(fallbackQuickStarts);
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
  const backend = input.backend;
  const limit = input.limit;

  useEffect(() => {
    const setQuickStartsIfChanged = (
      nextQuickStarts: ReadonlyArray<T3TeamSidecarRecipeQuickStart>,
    ) => {
      setQuickStarts((current) =>
        areQuickStartsEqual(current, nextQuickStarts) ? current : nextQuickStarts,
      );
    };

    setQuickStartsIfChanged(fallbackQuickStarts);

    if (!backend || !discoveryRequest) {
      return;
    }

    let cancelled = false;
    void backend.projectWorkspace
      .discoverRecipes(discoveryRequest)
      .then((response) => {
        if (cancelled) {
          return;
        }
        // Gate on what was DISCOVERED, not on `hasProjectLocalRecipes` — pack-shipped recipes are a
        // legitimate source that reports that flag false. Empty list still means bundled fallback.
        if (response.recipes.length === 0) {
          setQuickStartsIfChanged(fallbackQuickStarts);
          return;
        }
        const discoveredQuickStarts = mapDiscoveredRecipesToQuickStarts(
          response.recipes,
          discoveryRequest.context.surface,
          limit,
          discoveryRequest.context,
        );
        setQuickStartsIfChanged(
          mergeSidecarRecipeQuickStarts(discoveredQuickStarts, fallbackQuickStarts, limit),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setQuickStartsIfChanged(fallbackQuickStarts);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [backend, discoveryRequest, fallbackQuickStarts, limit]);

  return quickStarts;
}
