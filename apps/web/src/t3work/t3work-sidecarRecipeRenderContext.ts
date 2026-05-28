import {
  type DiscoverProjectRecipesRequest,
  type ProjectRecipeDiscovered,
  type ProjectRecipeRenderContext,
  type RecipeSurface,
} from "@t3tools/project-recipes";
import { getT3WorkProfile, toRecipeProfileContext } from "@t3tools/t3work-skill-packs";

import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import { buildAvailableContextKeys } from "~/t3work/t3work-sidecarRecipeContextKeys";
import type {
  T3workSidecarRecipeInput,
  T3workSidecarRecipeQuickStart,
} from "~/t3work/t3work-sidecarRecipeTypes";

const PINNED_T3WORK_META_QUICK_START_IDS = new Set(["create-contextual-recipe"]);

export function buildPinnedQuickStartSelection<
  T extends { readonly recipe: { readonly id: string } },
>(matches: ReadonlyArray<T>, limit: number): ReadonlyArray<T> {
  const pinned: Array<T> = [];
  const regular: Array<T> = [];
  for (const match of matches) {
    if (PINNED_T3WORK_META_QUICK_START_IDS.has(match.recipe.id)) {
      pinned.push(match);
    } else {
      regular.push(match);
    }
  }
  return [...regular.slice(0, limit), ...pinned];
}

function hasAttachedWorkitem(
  attachments: ReadonlyArray<T3WorkContextAttachment> | undefined,
): boolean {
  return (attachments ?? []).some((attachment) => attachment.kind === "jira-work-item");
}

function buildRenderContextAttachments(
  attachments: ReadonlyArray<T3WorkContextAttachment> | undefined,
) {
  return (attachments ?? []).map((attachment) => {
    const renderAttachment = {
      kind: attachment.kind,
      label: attachment.label,
    } as {
      kind: string;
      label: string;
      description?: string;
      jiraIssueType?: string;
      summaryItems?: typeof attachment.summaryItems;
    };

    if (attachment.description) {
      renderAttachment.description = attachment.description;
    }
    if (attachment.jiraIssueType) {
      renderAttachment.jiraIssueType = attachment.jiraIssueType;
    }
    if (attachment.summaryItems) {
      renderAttachment.summaryItems = attachment.summaryItems;
    }

    return renderAttachment;
  });
}

function hasExplicitWorkitemContext(input: T3workSidecarRecipeInput): boolean {
  return Boolean(
    input.resourceKind || input.selectedWorkTitle || input.jiraIssueType || input.workitemPriority,
  );
}

export function buildRecipeRenderContext(
  input: T3workSidecarRecipeInput,
  profile: ReturnType<typeof getT3WorkProfile>,
  workspaceRoot?: string,
): ProjectRecipeRenderContext {
  const explicitWorkitemContext = hasExplicitWorkitemContext(input);
  const attachedWorkitem = hasAttachedWorkitem(input.contextAttachments);
  const availableContextKeys = buildAvailableContextKeys(input);
  const integrationLinkedResources = [...new Set(input.availableIntegrations ?? [])]
    .filter((provider) => provider !== input.project.source.provider)
    .map((provider, index) => ({
      id: `${provider}-${index}`,
      kind: `integration.${provider}`,
      provider,
      label: provider,
    }));
  const linkedResources = [...integrationLinkedResources, ...(input.linkedResources ?? [])];

  return {
    surface: input.surface,
    project: {
      id: input.project.id,
      title: input.project.title,
      provider: input.project.source.provider,
      ...(workspaceRoot ? { workspaceRoot } : {}),
    },
    ...(explicitWorkitemContext
      ? {
          workitem: {
            ...(input.resourceKind ? { kind: input.resourceKind } : {}),
            displayId: input.selectedWorkLabel,
            ...(input.selectedWorkTitle ? { title: input.selectedWorkTitle } : {}),
            ...(input.jiraIssueType ? { type: input.jiraIssueType } : {}),
            ...(input.workitemPriority ? { priority: input.workitemPriority } : {}),
            ...(input.ticketContext?.status ? { status: input.ticketContext.status } : {}),
            ...(input.ticketContext?.assignee ? { assignee: input.ticketContext.assignee } : {}),
            ...(input.ticketContext?.assigneeRelation
              ? { assigneeRelation: input.ticketContext.assigneeRelation }
              : {}),
            ...(typeof input.ticketContext?.estimateValue === "number"
              ? { estimateValue: input.ticketContext.estimateValue }
              : {}),
            ...(typeof input.ticketContext?.originalEstimateHours === "number"
              ? { originalEstimateHours: input.ticketContext.originalEstimateHours }
              : {}),
            ...(typeof input.ticketContext?.remainingEstimateHours === "number"
              ? { remainingEstimateHours: input.ticketContext.remainingEstimateHours }
              : {}),
            ...(input.ticketContext?.relationships
              ? { relationships: input.ticketContext.relationships }
              : {}),
            ...(input.ticketContext?.github ? { github: input.ticketContext.github } : {}),
            ...(input.project.source.provider === "atlassian" && input.resourceKind === "ticket"
              ? { provider: "jira" }
              : { provider: input.project.source.provider }),
          },
        }
      : {}),
    linkedResources,
    artifacts: [],
    ...(input.contextAttachments && input.contextAttachments.length > 0
      ? { contextAttachments: buildRenderContextAttachments(input.contextAttachments) }
      : {}),
    ...(input.dashboardMode !== undefined || input.contextAttachments?.length
      ? {
          surfaceState: {
            ...(input.dashboardMode ? { dashboardMode: input.dashboardMode } : {}),
            hasContextAttachments: (input.contextAttachments?.length ?? 0) > 0,
            hasSelectedWork: explicitWorkitemContext || attachedWorkitem,
            ...(input.currentViewSummary ? { currentView: input.currentViewSummary } : {}),
          },
        }
      : {}),
    profile: {
      id: profile.id,
      title: profile.title,
      ...toRecipeProfileContext(profile),
    },
    enabledSkillPacks: profile.recommendedSkillPackIds,
    schema: {},
    availableContextKeys,
  };
}

export function buildProjectRecipeDiscoveryRequest(
  input: T3workSidecarRecipeInput & { readonly workspaceRoot: string },
): DiscoverProjectRecipesRequest {
  const profile = getT3WorkProfile(input.profileId);
  return {
    workspaceRoot: input.workspaceRoot,
    context: buildRecipeRenderContext(input, profile, input.workspaceRoot),
  };
}

export function mapDiscoveredRecipesToQuickStarts(
  recipes: ReadonlyArray<ProjectRecipeDiscovered>,
  surface: RecipeSurface,
  limit: number | undefined,
  renderContext: ProjectRecipeRenderContext,
): ReadonlyArray<T3workSidecarRecipeQuickStart> {
  const visibleRecipes = buildPinnedQuickStartSelection(
    recipes.map((recipe) => ({ recipe })),
    limit ?? 5,
  ).map((entry) => entry.recipe);

  return visibleRecipes.map((recipe) => {
    const quickStart: T3workSidecarRecipeQuickStart = {
      id: recipe.id,
      title: recipe.displayName,
      description: recipe.shortDescription,
      prompt: recipe.prompt,
      workflow: {
        kind: "recipe",
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        ...(recipe.kickoff ? { kickoff: recipe.kickoff } : {}),
        title: recipe.displayName,
        description: recipe.shortDescription,
        source: recipe.source,
        surface,
        ...(recipe.reason ? { reason: recipe.reason } : {}),
        recipePath: recipe.recipePath,
        promptPath: recipe.promptPath,
        ...(recipe.workflowPath ? { workflowPath: recipe.workflowPath } : {}),
        allowedToolGroups: recipe.allowedToolGroups,
      },
    };

    return recipe.actionViewSource
      ? Object.assign(quickStart, {
          actionView: {
            source: recipe.actionViewSource,
            ...(recipe.actionViewPath ? { path: recipe.actionViewPath } : {}),
            context: renderContext,
          },
        })
      : quickStart;
  });
}
