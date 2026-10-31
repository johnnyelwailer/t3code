/**
 * The view a thread is opened beside, published as it changes and read by `t3_view_read`.
 * Surface names follow `t3teamToolCatalogCore.ts`; selection kinds are neutral (`change-request`).
 */
import * as Schema from "effect/Schema";

import { NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const T3TEAM_VIEW_CONTEXT_VERSION = 1;
/** Most visible item ids a publication carries; `visibleItemCount` keeps the true total. */
export const T3TEAM_VIEW_CONTEXT_MAX_ITEM_IDS = 200;

export const T3TeamViewSurface = Schema.Literals(["my-work", "backlog", "work-item", "project"]);
export type T3TeamViewSurface = typeof T3TeamViewSurface.Type;

export const T3TeamViewSelection = Schema.Struct({
  kind: Schema.Literals(["work-item", "change-request"]),
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
});
export type T3TeamViewSelection = typeof T3TeamViewSelection.Type;

const FilterValue = Schema.Union([
  Schema.String.check(Schema.isMaxLength(500)),
  Schema.Number,
  Schema.Boolean,
  Schema.Array(Schema.String.check(Schema.isMaxLength(200))).check(Schema.isMaxLength(100)),
]);

export const T3TeamViewContext = Schema.Struct({
  version: Schema.Literal(T3TEAM_VIEW_CONTEXT_VERSION),
  surface: T3TeamViewSurface,
  projectId: TrimmedNonEmptyString.check(Schema.isMaxLength(200)),
  /** The item the view has opened beside itself, if any. */
  selection: Schema.NullOr(T3TeamViewSelection),
  /** The view's active filters, sort and grouping, by the view's own state names. */
  filters: Schema.Record(Schema.String.check(Schema.isMaxLength(80)), FilterValue),
  /** Ids of the items on screen after filtering, in display order, capped. */
  visibleItemIds: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(200))).check(
    Schema.isMaxLength(T3TEAM_VIEW_CONTEXT_MAX_ITEM_IDS),
  ),
  /** How many items are on screen; above `visibleItemIds.length` when the ids were capped. */
  visibleItemCount: NonNegativeInt,
});
export type T3TeamViewContext = typeof T3TeamViewContext.Type;

/**
 * `POST /api/t3team/thread/view-context`: `viewContext: null` clears the thread's entry. The server
 * ignores a publication whose `sequence` is not above the last one it saw for the thread, so
 * requests that arrive out of order cannot overwrite a newer one or a clear.
 */
export const T3TeamThreadViewContextPublication = Schema.Struct({
  threadId: ThreadId,
  sequence: NonNegativeInt,
  viewContext: Schema.NullOr(T3TeamViewContext),
});
export type T3TeamThreadViewContextPublication = typeof T3TeamThreadViewContextPublication.Type;

/** A stored publication: the context plus when the server received it, for staleness. */
export type T3TeamStoredViewContext = {
  readonly viewContext: T3TeamViewContext;
  readonly publishedAtMs: number;
};
