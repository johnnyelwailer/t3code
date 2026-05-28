import * as Schema from "effect/Schema";

export const RecipeSurface = Schema.Literals([
  "project.dashboard.backlog",
  "project.dashboard.myWork",
  "workitem.detail.sidepanel",
  "thread.context",
  "github.pull_request.detail.sidepanel",
  "github.pull_request.diff.selection",
  "github.review.comment",
]);
export type RecipeSurface = typeof RecipeSurface.Type;
