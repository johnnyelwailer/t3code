import * as Schema from "effect/Schema";

import { type SerializableQueryable } from "./queryable.ts";

const QueryableState = Schema.Literals(["idle", "loading", "ready", "error"]);
const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown);

export const T3TeamActionRecipeSurface = Schema.Literals([
  "project.dashboard.backlog",
  "project.dashboard.myWork",
  "workitem.detail.sidepanel",
  "thread.context",
  "github.pull_request.detail.sidepanel",
  "github.pull_request.diff.selection",
  "github.review.comment",
]);
export type T3TeamActionRecipeSurface = typeof T3TeamActionRecipeSurface.Type;

export const T3TeamActionRecipeProfile = Schema.Struct({
  technicalDepth: Schema.Literals(["low", "medium", "high"]),
  brevity: Schema.Literals(["short", "balanced", "detailed"]),
  guidanceStyle: Schema.Literals(["guided", "balanced", "expert"]),
  detailDensity: Schema.Literals(["guided", "balanced", "expert"]),
  preferredArtifactKinds: Schema.Array(Schema.String),
  defaultActionFamilies: Schema.Array(Schema.String),
  defaultRecipeWeights: Schema.Record(Schema.String, Schema.Number),
});
export type T3TeamActionRecipeProfile = typeof T3TeamActionRecipeProfile.Type;

export const T3TeamActionRecipeProject = Schema.Struct({
  id: Schema.optional(Schema.String),
  title: Schema.String,
  provider: Schema.optional(Schema.String),
  workspaceRoot: Schema.optional(Schema.String),
  raw: Schema.optional(UnknownRecord),
});
export type T3TeamActionRecipeProject = typeof T3TeamActionRecipeProject.Type;

export const T3TeamActionRecipeWorkitem = Schema.Struct({
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
export type T3TeamActionRecipeWorkitem = typeof T3TeamActionRecipeWorkitem.Type;

export const T3TeamActionRecipeLinkedResource = Schema.Struct({
  kind: Schema.String,
  id: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  raw: Schema.optional(UnknownRecord),
});
export type T3TeamActionRecipeLinkedResource = typeof T3TeamActionRecipeLinkedResource.Type;

export const T3TeamActionRecipeArtifact = Schema.Struct({
  kind: Schema.String,
  label: Schema.optional(Schema.String),
  path: Schema.optional(Schema.String),
  raw: Schema.optional(UnknownRecord),
});
export type T3TeamActionRecipeArtifact = typeof T3TeamActionRecipeArtifact.Type;

export const T3TeamActionRecipeContextAttachment = Schema.Struct({
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
export type T3TeamActionRecipeContextAttachment = typeof T3TeamActionRecipeContextAttachment.Type;

export const T3TeamActionRecipeQueryable = <Item extends Schema.Top>(item: Item) =>
  Schema.Struct({
    state: QueryableState,
    items: Schema.Array(item),
  });

export type T3TeamActionRecipeQueryable<Item> = SerializableQueryable<Item>;

export const T3TeamActionRecipeSurfaceState = Schema.Struct({
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
export type T3TeamActionRecipeSurfaceState = typeof T3TeamActionRecipeSurfaceState.Type;

const BaseContextFields = {
  project: T3TeamActionRecipeProject,
  workitem: Schema.optional(T3TeamActionRecipeWorkitem),
  linkedResources: T3TeamActionRecipeQueryable(T3TeamActionRecipeLinkedResource),
  artifacts: T3TeamActionRecipeQueryable(T3TeamActionRecipeArtifact),
  profile: T3TeamActionRecipeProfile,
  schema: UnknownRecord,
  enabledSkillPacks: Schema.Array(Schema.String),
  availableContextKeys: T3TeamActionRecipeQueryable(Schema.String),
  contextAttachments: Schema.optional(
    T3TeamActionRecipeQueryable(T3TeamActionRecipeContextAttachment),
  ),
  surfaceState: Schema.optional(T3TeamActionRecipeSurfaceState),
} as const;

export const T3TeamActionRecipeBacklogContext = Schema.Struct({
  surface: Schema.Literal("project.dashboard.backlog"),
  ...BaseContextFields,
});

export const T3TeamActionRecipeMyWorkContext = Schema.Struct({
  surface: Schema.Literal("project.dashboard.myWork"),
  ...BaseContextFields,
});

export const T3TeamActionRecipeWorkitemContext = Schema.Struct({
  surface: Schema.Literal("workitem.detail.sidepanel"),
  ...BaseContextFields,
});

export const T3TeamActionRecipeThreadContext = Schema.Struct({
  surface: Schema.Literal("thread.context"),
  ...BaseContextFields,
});

export const T3TeamActionRecipeGithubPullRequestContext = Schema.Struct({
  surface: Schema.Literal("github.pull_request.detail.sidepanel"),
  ...BaseContextFields,
});

export const T3TeamActionRecipeGithubDiffSelectionContext = Schema.Struct({
  surface: Schema.Literal("github.pull_request.diff.selection"),
  ...BaseContextFields,
});

export const T3TeamActionRecipeGithubReviewCommentContext = Schema.Struct({
  surface: Schema.Literal("github.review.comment"),
  ...BaseContextFields,
});

export const T3TeamActionRecipeContext = Schema.Union([
  T3TeamActionRecipeBacklogContext,
  T3TeamActionRecipeMyWorkContext,
  T3TeamActionRecipeWorkitemContext,
  T3TeamActionRecipeThreadContext,
  T3TeamActionRecipeGithubPullRequestContext,
  T3TeamActionRecipeGithubDiffSelectionContext,
  T3TeamActionRecipeGithubReviewCommentContext,
]);
export type T3TeamActionRecipeContext = typeof T3TeamActionRecipeContext.Type;

export const defaultT3TeamActionRecipeProfile: T3TeamActionRecipeProfile = {
  technicalDepth: "medium",
  brevity: "balanced",
  guidanceStyle: "balanced",
  detailDensity: "balanced",
  preferredArtifactKinds: [],
  defaultActionFamilies: [],
  defaultRecipeWeights: {},
};

export function resolveT3TeamActionRecipeContextSchema(surface: T3TeamActionRecipeSurface) {
  switch (surface) {
    case "project.dashboard.backlog":
      return T3TeamActionRecipeBacklogContext;
    case "project.dashboard.myWork":
      return T3TeamActionRecipeMyWorkContext;
    case "workitem.detail.sidepanel":
      return T3TeamActionRecipeWorkitemContext;
    case "thread.context":
      return T3TeamActionRecipeThreadContext;
    case "github.pull_request.detail.sidepanel":
      return T3TeamActionRecipeGithubPullRequestContext;
    case "github.pull_request.diff.selection":
      return T3TeamActionRecipeGithubDiffSelectionContext;
    case "github.review.comment":
      return T3TeamActionRecipeGithubReviewCommentContext;
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

const SURFACE_CONTEXT_MAP_LINES: Record<T3TeamActionRecipeSurface, ReadonlyArray<string>> = {
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

export function buildT3TeamActionRecipeContextMap(surface: T3TeamActionRecipeSurface): string {
  return [...BASE_CONTEXT_MAP_LINES, ...SURFACE_CONTEXT_MAP_LINES[surface]].join("\n") + "\n";
}

export function createEmptyT3TeamActionRecipeContext(
  surface: T3TeamActionRecipeSurface,
): T3TeamActionRecipeContext {
  return {
    surface,
    project: { title: "" },
    linkedResources: { state: "idle", items: [] },
    artifacts: { state: "idle", items: [] },
    profile: defaultT3TeamActionRecipeProfile,
    schema: {},
    enabledSkillPacks: [],
    availableContextKeys: { state: "idle", items: [] },
  };
}
