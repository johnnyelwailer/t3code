import type { T3workSidecarRecipeInput } from "~/t3work/t3work-sidecarRecipeTypes";

export function buildT3workSidecarRecipeInputKey(input: T3workSidecarRecipeInput): string {
  return JSON.stringify({
    surface: input.surface,
    project: {
      id: input.project.id,
      title: input.project.title,
      source: input.project.source,
      workspace: input.project.workspace,
    },
    profileId: input.profileId ?? null,
    selectedWorkLabel: input.selectedWorkLabel,
    selectedWorkTitle: input.selectedWorkTitle ?? null,
    resourceKind: input.resourceKind ?? null,
    jiraIssueType: input.jiraIssueType ?? null,
    workitemPriority: input.workitemPriority ?? null,
    dashboardMode: input.dashboardMode ?? null,
    currentViewSummary: input.currentViewSummary ?? null,
    ticketContext: input.ticketContext ?? null,
    contextAttachments: input.contextAttachments ?? [],
    linkedResources: input.linkedResources ?? [],
    availableIntegrations: input.availableIntegrations ?? [],
    availableContextKeys: input.availableContextKeys ?? [],
    limit: input.limit ?? null,
  });
}
