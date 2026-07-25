import type { Queryable } from "@t3tools/project-context";

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

type ProjectRecipeRenderContextBase = {
  readonly surface: RecipeSurface;
  readonly project: ProjectRecipeRenderProject;
  readonly linkedResources: Queryable<ProjectRecipeRenderLinkedResource>;
  readonly artifacts: Queryable<ProjectRecipeRenderArtifact>;
  readonly profile: ProjectRecipeRenderProfile;
  readonly enabledSkillPacks: ReadonlyArray<string>;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly availableContextKeys: Queryable<string>;
};

export type ProjectRecipeDashboardBacklogRenderContext = ProjectRecipeRenderContextBase & {
  readonly surface: "project.dashboard.backlog";
  readonly workitem?: ProjectRecipeRenderWorkitem;
  readonly contextAttachments?: Queryable<ProjectRecipeRenderContextAttachment>;
  readonly surfaceState?: ProjectRecipeRenderSurfaceState & {
    readonly dashboardMode?: "backlog";
  };
};

export type ProjectRecipeDashboardMyWorkRenderContext = ProjectRecipeRenderContextBase & {
  readonly surface: "project.dashboard.myWork";
  readonly workitem?: ProjectRecipeRenderWorkitem;
  readonly contextAttachments?: Queryable<ProjectRecipeRenderContextAttachment>;
  readonly surfaceState?: ProjectRecipeRenderSurfaceState & {
    readonly dashboardMode?: "my-work";
  };
};

export type ProjectRecipeWorkitemDetailRenderContext = ProjectRecipeRenderContextBase & {
  readonly surface: "workitem.detail.sidepanel";
  readonly workitem?: ProjectRecipeRenderWorkitem;
  readonly contextAttachments?: Queryable<ProjectRecipeRenderContextAttachment>;
  readonly surfaceState?: ProjectRecipeRenderSurfaceState;
};

export type ProjectRecipeOtherRenderContext = ProjectRecipeRenderContextBase & {
  readonly surface: Exclude<
    RecipeSurface,
    "project.dashboard.backlog" | "project.dashboard.myWork" | "workitem.detail.sidepanel"
  >;
  readonly workitem?: ProjectRecipeRenderWorkitem;
  readonly contextAttachments?: Queryable<ProjectRecipeRenderContextAttachment>;
  readonly surfaceState?: ProjectRecipeRenderSurfaceState;
};

export type ProjectRecipeRenderContext =
  | ProjectRecipeDashboardBacklogRenderContext
  | ProjectRecipeDashboardMyWorkRenderContext
  | ProjectRecipeWorkitemDetailRenderContext
  | ProjectRecipeOtherRenderContext;

export type ProjectRecipeVisibilityResult = {
  readonly visible: boolean;
  readonly rank?: number;
  readonly reason?: string;
};

export type ProjectRecipeManifest = {
  readonly id: string;
  readonly version: string;
  readonly scope: "project";
  readonly displayName: string;
  readonly shortDescription: string;
  readonly icon?: string;
  /** Composer `/` alias, stored without the leading slash. */
  readonly slashAlias?: string;
  readonly surfaces: ReadonlyArray<RecipeSurface>;
  readonly rank?: number | string;
  readonly visibleWhen?: string;
  readonly actionView?: string;
  readonly prompt: string;
  readonly kickoff?: ProjectRecipeKickoffProgram;
  readonly files?: ReadonlyArray<string>;
  readonly initScript?: string;
  readonly workflow?: string;
  readonly allowedToolGroups?: ReadonlyArray<string>;
};

/**
 * Where a discovered recipe came from (Epic 16 §Recipe Sources And Precedence): pack-provided
 * and project-local recipes are the same concept with different sources, merged through the
 * pack precedence model. `pack` covers every pack scope; `packId`/`packScope` name the origin.
 */
export type ProjectRecipeSource = "project-local" | "pack";

/**
 * Source label carried by a launch/kickoff descriptor. Adds `bundled` — the host's own built-in
 * quick starts, which are not discovered from a recipe source at all.
 */
export type ProjectRecipeLaunchSource = "bundled" | ProjectRecipeSource;

/**
 * One named action of a multi-action recipe (Epic 16 §Plugin Modules). `defaultAction` is NOT
 * listed here — it stays in `workflowPath`, so a launcher that knows nothing about actions keeps
 * behaving exactly as before.
 */
export type ProjectRecipeDiscoveredAction = {
  readonly name: string;
  /** Resolved `.workflow.ts`. Absent for a prompt action, which declares no workflow. */
  readonly workflowPath?: string;
  /** Resolved prompt file, for a `definePrompt("./prompt.md")` action. */
  readonly promptPath?: string;
  /** Inline prompt text, for a `definePrompt({ text })` action. */
  readonly promptText?: string;
};

export type ProjectRecipeDiscovered = {
  readonly id: string;
  readonly version: string;
  readonly source: ProjectRecipeSource;
  /** Pack that contributed this recipe. Present only when `source === "pack"`. */
  readonly packId?: string;
  /** Pack scope the recipe inherits its precedence from. Present only when `source === "pack"`. */
  readonly packScope?: string;
  readonly displayName: string;
  readonly shortDescription: string;
  readonly icon?: string;
  /** Composer `/` alias, stored without the leading slash. */
  readonly slashAlias?: string;
  readonly surfaces: ReadonlyArray<RecipeSurface>;
  readonly rank: number;
  readonly reason?: string;
  readonly prompt: string;
  readonly kickoff?: ProjectRecipeKickoffProgram;
  readonly sourcePath?: string;
  readonly promptPath: string;
  readonly recipePath: string;
  readonly actionViewPath?: string;
  readonly actionViewSource?: string;
  readonly workflowPath?: string;
  /** Named actions besides `defaultAction`; a launch may name one instead of launching the
   * default. Absent for single-action recipes and for `recipe.json` recipes. */
  readonly actions?: ReadonlyArray<ProjectRecipeDiscoveredAction>;
  readonly allowedToolGroups: ReadonlyArray<string>;
  /** Names of the recipe-private scripts a `recipe.ts` module registers (Epic 25 §Scripts).
   * The live ScriptRefs are re-materialized server-side at launch by re-importing the module;
   * this field only announces they exist. Absent for `recipe.json` recipes. */
  readonly scriptNames?: ReadonlyArray<string>;
};

export type DiscoverProjectRecipesRequest = {
  readonly workspaceRoot: string;
  readonly context: ProjectRecipeRenderContext;
};

export type DiscoverProjectRecipesResponse = {
  readonly workspaceRoot: string;
  readonly hasProjectLocalRecipes: boolean;
  readonly recipes: ReadonlyArray<ProjectRecipeDiscovered>;
  /** Non-fatal per-source notes (a pack recipe that failed to load, an id shadowed by a
   * higher-precedence source). Surfaced in the advanced/debug surface, never inline. */
  readonly diagnostics?: ReadonlyArray<string>;
};

export type ManagedProjectRecipeSourceKind = "recipe-json" | "recipe-module";

export type ManagedProjectRecipe = {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly shortDescription: string;
  readonly icon?: string;
  readonly surfaces: ReadonlyArray<RecipeSurface>;
  readonly rank?: number | string;
  readonly active: boolean;
  readonly sourceKind: ManagedProjectRecipeSourceKind;
  readonly editable: boolean;
  readonly deletable: boolean;
  readonly recipePath: string;
  readonly sourcePath: string;
  readonly promptPath?: string;
  readonly prompt?: string;
  readonly workflowPath?: string;
  readonly actionViewPath?: string;
};

export type ListManagedProjectRecipesRequest = {
  readonly workspaceRoot: string;
};

export type ListManagedProjectRecipesResponse = {
  readonly workspaceRoot: string;
  readonly hasProjectLocalRecipes: boolean;
  readonly recipes: ReadonlyArray<ManagedProjectRecipe>;
};

export type UpdateManagedProjectRecipeRequest = {
  readonly workspaceRoot: string;
  readonly recipePath: string;
  readonly active?: boolean;
  readonly displayName?: string;
  readonly shortDescription?: string;
  readonly prompt?: string;
};

export type UpdateManagedProjectRecipeResponse = {
  readonly workspaceRoot: string;
  readonly recipe: ManagedProjectRecipe;
};

export type DeleteManagedProjectRecipeRequest = {
  readonly workspaceRoot: string;
  readonly recipePath: string;
};

export type DeleteManagedProjectRecipeResponse = {
  readonly workspaceRoot: string;
  readonly deletedRecipePath: string;
};
