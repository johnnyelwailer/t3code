import type { RecipeProfileContext, RecipeSurface } from "./recipe.js";
import type { ProjectRecipeKickoffProgram } from "./kickoff.js";

export type ProjectRecipeRenderProject = {
  readonly id?: string;
  readonly title: string;
  readonly provider?: string;
  readonly workspaceRoot?: string;
  readonly raw?: Record<string, unknown>;
};

export type ProjectRecipeRenderWorkitem = {
  readonly kind?: string;
  readonly id?: string;
  readonly displayId?: string;
  readonly title?: string;
  readonly type?: string;
  readonly provider?: string;
  readonly priority?: string;
  readonly status?: string;
  readonly assignee?: string;
  readonly assigneeRelation?: "me" | "other" | "unassigned";
  readonly estimateValue?: number;
  readonly originalEstimateHours?: number;
  readonly remainingEstimateHours?: number;
  readonly relationships?: {
    readonly parentKey?: string;
    readonly childKeys: ReadonlyArray<string>;
    readonly referenceKeys: ReadonlyArray<string>;
    readonly blockedByKeys: ReadonlyArray<string>;
    readonly blockingKeys: ReadonlyArray<string>;
  };
  readonly github?: {
    readonly pullRequestCount?: number;
    readonly openPullRequestCount?: number;
    readonly draftPullRequestCount?: number;
    readonly mergedPullRequestCount?: number;
    readonly closedPullRequestCount?: number;
    readonly reviewRequestedPullRequestCount?: number;
    readonly commentCount?: number;
    readonly reviewCommentCount?: number;
  };
  readonly url?: string;
  readonly raw?: Record<string, unknown>;
};

export type ProjectRecipeRenderLinkedResource = {
  readonly kind: string;
  readonly id?: string;
  readonly provider?: string;
  readonly label?: string;
  readonly title?: string;
  readonly url?: string;
  readonly raw?: Record<string, unknown>;
};

export type ProjectRecipeRenderArtifact = {
  readonly kind: string;
  readonly label?: string;
  readonly path?: string;
  readonly raw?: Record<string, unknown>;
};

export type ProjectRecipeRenderContextAttachment = {
  readonly kind: string;
  readonly label: string;
  readonly description?: string;
  readonly jiraIssueType?: string;
  readonly summaryItems?: ReadonlyArray<{ label: string; value: string }>;
  readonly raw?: Record<string, unknown>;
};

export type ProjectRecipeRenderSurfaceState = {
  readonly dashboardMode?: string;
  readonly hasContextAttachments?: boolean;
  readonly hasSelectedWork?: boolean;
  readonly currentView?: {
    readonly itemCount: number;
    readonly bugCount?: number;
    readonly primaryItemLabel?: string;
    readonly primaryBugLabel?: string;
    readonly needsMyActionPreset?: string;
    readonly needsMyActionCount?: number;
  };
};

export type ProjectRecipeRenderProfile = RecipeProfileContext & {
  readonly id?: string;
  readonly title?: string;
};

export type ProjectRecipeRenderContext = {
  readonly surface: RecipeSurface;
  readonly project: ProjectRecipeRenderProject;
  readonly workitem?: ProjectRecipeRenderWorkitem;
  readonly linkedResources: ReadonlyArray<ProjectRecipeRenderLinkedResource>;
  readonly artifacts: ReadonlyArray<ProjectRecipeRenderArtifact>;
  readonly contextAttachments?: ReadonlyArray<ProjectRecipeRenderContextAttachment>;
  readonly surfaceState?: ProjectRecipeRenderSurfaceState;
  readonly profile: ProjectRecipeRenderProfile;
  readonly enabledSkillPacks: ReadonlyArray<string>;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly availableContextKeys: ReadonlyArray<string>;
};

export type ProjectRecipeVisibilityResult = {
  readonly visible: boolean;
  readonly rank?: number;
  readonly reason?: string;
};

export type ProjectRecipeVisibilityExpression = {
  readonly kind: "expr";
  readonly expr: string;
};

export type ProjectRecipeManifest = {
  readonly id: string;
  readonly version: string;
  readonly scope: "project";
  readonly displayName: string;
  readonly shortDescription: string;
  readonly icon?: string;
  readonly surfaces: ReadonlyArray<RecipeSurface>;
  readonly rank?: number | string;
  readonly visibleWhen?: string | ProjectRecipeVisibilityExpression;
  readonly actionView?: string;
  readonly prompt: string;
  readonly kickoff?: ProjectRecipeKickoffProgram;
  readonly files?: ReadonlyArray<string>;
  readonly initScript?: string;
  readonly workflow?: string;
  readonly allowedToolGroups?: ReadonlyArray<string>;
};

export type ProjectRecipeDiscovered = {
  readonly id: string;
  readonly version: string;
  readonly source: "project-local";
  readonly displayName: string;
  readonly shortDescription: string;
  readonly icon?: string;
  readonly surfaces: ReadonlyArray<RecipeSurface>;
  readonly rank: number;
  readonly reason?: string;
  readonly prompt: string;
  readonly kickoff?: ProjectRecipeKickoffProgram;
  readonly promptPath: string;
  readonly recipePath: string;
  readonly actionViewPath?: string;
  readonly actionViewSource?: string;
  readonly workflowPath?: string;
  readonly allowedToolGroups: ReadonlyArray<string>;
};

export type DiscoverProjectRecipesRequest = {
  readonly workspaceRoot: string;
  readonly context: ProjectRecipeRenderContext;
};

export type DiscoverProjectRecipesResponse = {
  readonly workspaceRoot: string;
  readonly hasProjectLocalRecipes: boolean;
  readonly recipes: ReadonlyArray<ProjectRecipeDiscovered>;
};
