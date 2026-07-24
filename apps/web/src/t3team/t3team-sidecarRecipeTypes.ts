import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectRecipeRenderContext, RecipeSurface } from "@t3tools/project-recipes";

import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import type { T3TeamDashboardRecipeCurrentViewSummary } from "~/t3team/t3team-dashboardRecipeSummary";
import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

export type T3TeamSidecarRecipeQuickStart = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly composerGuidance?: T3TeamRecipeComposerGuidance;
  readonly prompt: string;
  readonly workflow?: T3TeamKickoffWorkflow;
  readonly sourcePath?: string;
  readonly actionView?: T3TeamSidecarRecipeActionView;
};

export type T3TeamRecipeComposerGuidance = {
  readonly helperText?: string;
  readonly placeholder?: string;
};

export type T3TeamSidecarRecipeActionView = {
  readonly source: string;
  readonly path?: string;
  readonly context: ProjectRecipeRenderContext;
};

export type T3TeamSidecarRecipeLinkedResource = {
  readonly kind: string;
  readonly id?: string;
  readonly provider?: string;
  readonly label?: string;
  readonly title?: string;
  readonly url?: string;
  readonly raw?: Record<string, unknown>;
};

export type T3TeamSidecarRecipeTicketRelationships = {
  readonly parentKey?: string;
  readonly childKeys: ReadonlyArray<string>;
  readonly referenceKeys: ReadonlyArray<string>;
  readonly blockedByKeys: ReadonlyArray<string>;
  readonly blockingKeys: ReadonlyArray<string>;
};

export type T3TeamSidecarRecipeTicketGitHubSummary = {
  readonly pullRequestCount: number;
  readonly openPullRequestCount: number;
  readonly draftPullRequestCount: number;
  readonly mergedPullRequestCount: number;
  readonly closedPullRequestCount: number;
  readonly reviewRequestedPullRequestCount: number;
  readonly commentCount: number;
  readonly reviewCommentCount: number;
};

export type T3TeamSidecarRecipeTicketContext = {
  readonly status?: string | undefined;
  readonly assignee?: string | undefined;
  readonly assigneeRelation?: "me" | "other" | "unassigned" | undefined;
  readonly estimateValue?: number | undefined;
  readonly originalEstimateHours?: number | undefined;
  readonly remainingEstimateHours?: number | undefined;
  readonly relationships?: T3TeamSidecarRecipeTicketRelationships | undefined;
  readonly github?: T3TeamSidecarRecipeTicketGitHubSummary | undefined;
};

export type T3TeamSidecarRecipeInput = {
  readonly surface: RecipeSurface | "project.dashboard";
  readonly project: ProjectShellProject;
  readonly profileId?: string | undefined;
  readonly selectedWorkLabel: string;
  readonly selectedWorkTitle?: string | undefined;
  readonly resourceKind?: string | null | undefined;
  readonly jiraIssueType?: string | null | undefined;
  readonly workitemPriority?: string | null | undefined;
  readonly dashboardMode?: ProjectDashboardMode | undefined;
  readonly currentViewSummary?: T3TeamDashboardRecipeCurrentViewSummary | undefined;
  readonly ticketContext?: T3TeamSidecarRecipeTicketContext | undefined;
  readonly contextAttachments?: ReadonlyArray<T3TeamContextAttachment> | undefined;
  readonly linkedResources?: ReadonlyArray<T3TeamSidecarRecipeLinkedResource> | undefined;
  readonly availableIntegrations?: ReadonlyArray<string> | undefined;
  readonly availableContextKeys?: ReadonlyArray<string> | undefined;
  readonly limit?: number | undefined;
};
