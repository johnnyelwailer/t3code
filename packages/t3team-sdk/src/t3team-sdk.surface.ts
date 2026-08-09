/**
 * The placement surface vocabulary — where a recipe launcher / section may appear
 * (Epic 19 §Plugin SDK Surface).
 *
 * It lives in the SDK because the SDK is the lower layer: `@t3team/sdk` is the public authoring
 * surface (Epic 10 §Package Boundaries) and depends on nothing else in the t3team workspace, so
 * the `define*` helpers it owns can reference this without inverting the dependency direction.
 * `@t3tools/project-recipes` re-exports it (`src/surface.ts`) for its existing importers.
 */
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
