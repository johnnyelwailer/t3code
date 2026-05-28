import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectRecipeRenderContext, RecipeSurface } from "@t3tools/project-recipes";

import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import type { T3workDashboardRecipeCurrentViewSummary } from "~/t3work/t3work-dashboardRecipeSummary";
import type { ProjectDashboardMode } from "~/t3work/t3work-projectDashboardModeState";
import type { T3workKickoffWorkflow } from "~/t3work/t3work-types";

export type T3workSidecarRecipeQuickStart = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly composerGuidance?: T3workRecipeComposerGuidance;
  readonly prompt: string;
  readonly workflow: T3workKickoffWorkflow;
  readonly actionView?: T3workSidecarRecipeActionView;
};

export type T3workRecipeComposerGuidance = {
  readonly helperText?: string;
  readonly placeholder?: string;
};

export type T3workSidecarRecipeActionView = {
  readonly source: string;
  readonly path?: string;
  readonly context: ProjectRecipeRenderContext;
};

export type T3workSidecarRecipeLinkedResource = {
  readonly kind: string;
  readonly id?: string;
  readonly provider?: string;
  readonly label?: string;
  readonly title?: string;
  readonly url?: string;
  readonly raw?: Record<string, unknown>;
};

export type T3workSidecarRecipeTicketRelationships = {
  readonly parentKey?: string;
  readonly childKeys: ReadonlyArray<string>;
  readonly referenceKeys: ReadonlyArray<string>;
  readonly blockedByKeys: ReadonlyArray<string>;
  readonly blockingKeys: ReadonlyArray<string>;
};

export type T3workSidecarRecipeTicketGitHubSummary = {
  readonly pullRequestCount: number;
  readonly openPullRequestCount: number;
  readonly draftPullRequestCount: number;
  readonly mergedPullRequestCount: number;
  readonly closedPullRequestCount: number;
  readonly reviewRequestedPullRequestCount: number;
  readonly commentCount: number;
  readonly reviewCommentCount: number;
};

export type T3workSidecarRecipeTicketContext = {
  readonly status?: string | undefined;
  readonly assignee?: string | undefined;
  readonly assigneeRelation?: "me" | "other" | "unassigned" | undefined;
  readonly estimateValue?: number | undefined;
  readonly originalEstimateHours?: number | undefined;
  readonly remainingEstimateHours?: number | undefined;
  readonly relationships?: T3workSidecarRecipeTicketRelationships | undefined;
  readonly github?: T3workSidecarRecipeTicketGitHubSummary | undefined;
};

export type T3workSidecarRecipeInput = {
  readonly surface: RecipeSurface | "project.dashboard";
  readonly project: ProjectShellProject;
  readonly profileId?: string | undefined;
  readonly selectedWorkLabel: string;
  readonly selectedWorkTitle?: string | undefined;
  readonly resourceKind?: string | null | undefined;
  readonly jiraIssueType?: string | null | undefined;
  readonly workitemPriority?: string | null | undefined;
  readonly dashboardMode?: ProjectDashboardMode | undefined;
  readonly currentViewSummary?: T3workDashboardRecipeCurrentViewSummary | undefined;
  readonly ticketContext?: T3workSidecarRecipeTicketContext | undefined;
  readonly contextAttachments?: ReadonlyArray<T3WorkContextAttachment> | undefined;
  readonly linkedResources?: ReadonlyArray<T3workSidecarRecipeLinkedResource> | undefined;
  readonly availableIntegrations?: ReadonlyArray<string> | undefined;
  readonly availableContextKeys?: ReadonlyArray<string> | undefined;
  readonly limit?: number | undefined;
};
