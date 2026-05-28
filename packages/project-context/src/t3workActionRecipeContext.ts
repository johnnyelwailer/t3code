import * as Schema from "effect/Schema";

import { type SerializableQueryable } from "./queryable.ts";

const QueryableState = Schema.Literals(["idle", "loading", "ready", "error"]);
const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);

export const T3workActionRecipeSurface = Schema.Literals([
  "project.dashboard.backlog",
  "project.dashboard.myWork",
  "workitem.detail.sidepanel",
  "thread.context",
  "github.pull_request.detail.sidepanel",
  "github.pull_request.diff.selection",
  "github.review.comment",
]);
export type T3workActionRecipeSurface = typeof T3workActionRecipeSurface.Type;

export const T3workActionRecipeProfile = Schema.Struct({
  technicalDepth: Schema.Literals(["low", "medium", "high"]),
  brevity: Schema.Literals(["short", "balanced", "detailed"]),
  guidanceStyle: Schema.Literals(["guided", "balanced", "expert"]),
  detailDensity: Schema.Literals(["guided", "balanced", "expert"]),
  preferredArtifactKinds: Schema.Array(Schema.String),
  defaultActionFamilies: Schema.Array(Schema.String),
  defaultRecipeWeights: Schema.Record(Schema.String, Schema.Number),
});
export type T3workActionRecipeProfile = typeof T3workActionRecipeProfile.Type;

export const T3workActionRecipeProject = Schema.Struct({
  id: Schema.optional(Schema.String),
  title: Schema.String,
  provider: Schema.optional(Schema.String),
  workspaceRoot: Schema.optional(Schema.String),
  raw: Schema.optional(UnknownRecord),
});
export type T3workActionRecipeProject = typeof T3workActionRecipeProject.Type;

export const T3workActionRecipeWorkitem = Schema.Struct({
  kind: Schema.optional(Schema.String),
  id: Schema.optional(Schema.String),
  displayId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  priority: Schema.optional(Schema.String),
  assignee: Schema.optional(Schema.String),
  assigneeRelation: Schema.optional(Schema.Literals(["me", "other", "unassigned"])),
  estimateValue: Schema.optional(Schema.Number),
  originalEstimateHours: Schema.optional(Schema.Number),
  remainingEstimateHours: Schema.optional(Schema.Number),
  relationships: Schema.optional(
    Schema.Struct({
      parentKey: Schema.optional(Schema.String),
      childKeys: Schema.Array(Schema.String),
      referenceKeys: Schema.Array(Schema.String),
      blockedByKeys: Schema.Array(Schema.String),
      blockingKeys: Schema.Array(Schema.String),
    }),
  ),
  github: Schema.optional(
    Schema.Struct({
      pullRequestCount: Schema.optional(Schema.Number),
      openPullRequestCount: Schema.optional(Schema.Number),
      draftPullRequestCount: Schema.optional(Schema.Number),
      mergedPullRequestCount: Schema.optional(Schema.Number),
      closedPullRequestCount: Schema.optional(Schema.Number),
      reviewRequestedPullRequestCount: Schema.optional(Schema.Number),
      commentCount: Schema.optional(Schema.Number),
      reviewCommentCount: Schema.optional(Schema.Number),
    }),
  ),
  url: Schema.optional(Schema.String),
  raw: Schema.optional(UnknownRecord),
});
export type T3workActionRecipeWorkitem = typeof T3workActionRecipeWorkitem.Type;

export const T3workActionRecipeLinkedResource = Schema.Struct({
  kind: Schema.String,
  id: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  raw: Schema.optional(UnknownRecord),
});
export type T3workActionRecipeLinkedResource = typeof T3workActionRecipeLinkedResource.Type;

export const T3workActionRecipeArtifact = Schema.Struct({
  kind: Schema.String,
  label: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  raw: Schema.optional(UnknownRecord),
});
export type T3workActionRecipeArtifact = typeof T3workActionRecipeArtifact.Type;

export const T3workActionRecipeContextAttachment = Schema.Struct({
  kind: Schema.String,
  label: Schema.String,
  description: Schema.optional(Schema.String),
  jiraIssueType: Schema.optional(Schema.String),
  summaryItems: Schema.optional(
    Schema.Array(
      Schema.Struct({
        label: Schema.String,
        value: Schema.String,
      }),
    ),
  ),
  raw: Schema.optional(UnknownRecord),
});
export type T3workActionRecipeContextAttachment = typeof T3workActionRecipeContextAttachment.Type;

export const T3workActionRecipeQueryable = <Item extends Schema.Top>(item: Item) =>
  Schema.Struct({
    state: QueryableState,
    items: Schema.Array(item),
  });

export type T3workActionRecipeQueryable<Item> = SerializableQueryable<Item>;

export const T3workActionRecipeSurfaceState = Schema.Struct({
  dashboardMode: Schema.optional(Schema.String),
  hasContextAttachments: Schema.optional(Schema.Boolean),
  hasSelectedWork: Schema.optional(Schema.Boolean),
  currentView: Schema.optional(
    Schema.Struct({
      itemCount: Schema.Int,
      bugCount: Schema.optional(Schema.Int),
      primaryItemLabel: Schema.optional(Schema.String),
      primaryBugLabel: Schema.optional(Schema.String),
      needsMyActionPreset: Schema.optional(Schema.String),
      needsMyActionCount: Schema.optional(Schema.Int),
    }),
  ),
});
export type T3workActionRecipeSurfaceState = typeof T3workActionRecipeSurfaceState.Type;

const BaseContextFields = {
  project: T3workActionRecipeProject,
  workitem: Schema.optional(T3workActionRecipeWorkitem),
  linkedResources: T3workActionRecipeQueryable(T3workActionRecipeLinkedResource),
  artifacts: T3workActionRecipeQueryable(T3workActionRecipeArtifact),
  profile: T3workActionRecipeProfile,
  schema: UnknownRecord,
  enabledSkillPacks: Schema.Array(Schema.String),
  availableContextKeys: T3workActionRecipeQueryable(Schema.String),
  contextAttachments: Schema.optional(
    T3workActionRecipeQueryable(T3workActionRecipeContextAttachment),
  ),
  surfaceState: Schema.optional(T3workActionRecipeSurfaceState),
} as const;

export const T3workActionRecipeBacklogContext = Schema.Struct({
  surface: Schema.Literal("project.dashboard.backlog"),
  ...BaseContextFields,
});

export const T3workActionRecipeMyWorkContext = Schema.Struct({
  surface: Schema.Literal("project.dashboard.myWork"),
  ...BaseContextFields,
});

export const T3workActionRecipeWorkitemContext = Schema.Struct({
  surface: Schema.Literal("workitem.detail.sidepanel"),
  ...BaseContextFields,
});

export const T3workActionRecipeThreadContext = Schema.Struct({
  surface: Schema.Literal("thread.context"),
  ...BaseContextFields,
});

export const T3workActionRecipeGithubPullRequestContext = Schema.Struct({
  surface: Schema.Literal("github.pull_request.detail.sidepanel"),
  ...BaseContextFields,
});

export const T3workActionRecipeGithubDiffSelectionContext = Schema.Struct({
  surface: Schema.Literal("github.pull_request.diff.selection"),
  ...BaseContextFields,
});

export const T3workActionRecipeGithubReviewCommentContext = Schema.Struct({
  surface: Schema.Literal("github.review.comment"),
  ...BaseContextFields,
});

export const T3workActionRecipeContext = Schema.Union([
  T3workActionRecipeBacklogContext,
  T3workActionRecipeMyWorkContext,
  T3workActionRecipeWorkitemContext,
  T3workActionRecipeThreadContext,
  T3workActionRecipeGithubPullRequestContext,
  T3workActionRecipeGithubDiffSelectionContext,
  T3workActionRecipeGithubReviewCommentContext,
]);
export type T3workActionRecipeContext = typeof T3workActionRecipeContext.Type;

export const defaultT3workActionRecipeProfile: T3workActionRecipeProfile = {
  technicalDepth: "medium",
  brevity: "balanced",
  guidanceStyle: "balanced",
  detailDensity: "balanced",
  preferredArtifactKinds: [],
  defaultActionFamilies: [],
  defaultRecipeWeights: {},
};

export function resolveT3workActionRecipeContextSchema(surface: T3workActionRecipeSurface) {
  switch (surface) {
    case "project.dashboard.backlog":
      return T3workActionRecipeBacklogContext;
    case "project.dashboard.myWork":
      return T3workActionRecipeMyWorkContext;
    case "workitem.detail.sidepanel":
      return T3workActionRecipeWorkitemContext;
    case "thread.context":
      return T3workActionRecipeThreadContext;
    case "github.pull_request.detail.sidepanel":
      return T3workActionRecipeGithubPullRequestContext;
    case "github.pull_request.diff.selection":
      return T3workActionRecipeGithubDiffSelectionContext;
    case "github.review.comment":
      return T3workActionRecipeGithubReviewCommentContext;
  }
}

const BASE_CONTEXT_MAP_LINES = [
  "# Action recipe context",
  "",
  "Common fields",
  "- project: primary project context as a serializable Queryable.",
  "- workitem: focused work item context as a serializable Queryable.",
  "- linkedResources: related external resources as a serializable Queryable.",
  "- artifacts: known project artifacts as a serializable Queryable.",
  "- profile: recipe rendering profile preferences for this surface.",
  "- schema: best-effort context shape hints supplied by the client.",
  "- enabledSkillPacks: active skill-pack ids for the launch.",
  "- availableContextKeys: template-expression keys available to the recipe.",
  "- contextAttachments: explicit attachments selected for the launch.",
  "- surfaceState: optional view-state snapshot for the active surface.",
  "",
  "Queryable values serialize as { state, items }.",
  "In memory, the matching Queryable helpers expose where(...), count(), first(), and toReadonlyArray().",
];

const SURFACE_CONTEXT_MAP_LINES: Record<T3workActionRecipeSurface, ReadonlyArray<string>> = {
  "project.dashboard.backlog": [
    "",
    "Surface notes",
    "- backlog views typically use surfaceState.currentView plus backlog filter state.",
  ],
  "project.dashboard.myWork": [
    "",
    "Surface notes",
    "- my-work launches usually focus on assigned workitem slices and user-centric filters.",
  ],
  "workitem.detail.sidepanel": [
    "",
    "Surface notes",
    "- workitem detail launches should expect workitem.items[0] to be the active record when present.",
  ],
  "thread.context": [
    "",
    "Surface notes",
    "- thread launches usually rely on contextAttachments and linkedResources gathered from the current thread.",
  ],
  "github.pull_request.detail.sidepanel": [
    "",
    "Surface notes",
    "- pull request detail launches should expect linkedResources to include the active pull request ref.",
  ],
  "github.pull_request.diff.selection": [
    "",
    "Surface notes",
    "- diff selection launches may add selection metadata inside surfaceState.currentView.raw.",
  ],
  "github.review.comment": [
    "",
    "Surface notes",
    "- review comment launches may scope the active thread inside surfaceState.currentView.raw.",
  ],
};

export function buildT3workActionRecipeContextMap(surface: T3workActionRecipeSurface): string {
  return [...BASE_CONTEXT_MAP_LINES, ...SURFACE_CONTEXT_MAP_LINES[surface]].join("\n") + "\n";
}

export function createEmptyT3workActionRecipeContext(
  surface: T3workActionRecipeSurface,
): T3workActionRecipeContext {
  return {
    surface,
    project: { title: "" },
    linkedResources: { state: "idle", items: [] },
    artifacts: { state: "idle", items: [] },
    profile: defaultT3workActionRecipeProfile,
    schema: {},
    enabledSkillPacks: [],
    availableContextKeys: { state: "idle", items: [] },
  };
}
