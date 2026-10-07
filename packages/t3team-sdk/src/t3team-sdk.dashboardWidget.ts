/**
 * The `dashboard.widget` placement helper (Epic 19 §Plugin SDK Surface: "Widget tile inside a
 * project dashboard (backlog overview, my-work overview)"). It ships with its placement: the My
 * Work digest renders every section through a dashboard widget, and an arrangement — the
 * heuristic's or one an agent produced — places widgets by id.
 *
 * Stage 1 is trusted, like `defineSidecarSection`: `component` names a shell-owned React component
 * the host registers. What a placed widget shows comes from the arrangement (`content` says which
 * refs it takes), its data from the host's graph — a widget never fetches.
 */
import * as Schema from "effect/Schema";

import { RecipeSurface } from "./t3team-sdk.surface.ts";

/** Where on the dashboard a widget can stand: the narrow side lane, the main lane, the footer. */
export const DashboardWidgetPlacement = Schema.Literals(["side", "main", "footer"]);
export type DashboardWidgetPlacement = typeof DashboardWidgetPlacement.Type;

/**
 * The refs a placed widget lists: `tickets` (work items by id), `reviews` (pull requests waiting
 * for the viewer's review), or `none` for a widget that shows the graph by itself (a header).
 */
export const DashboardWidgetContent = Schema.Literals(["tickets", "reviews", "none"]);
export type DashboardWidgetContent = typeof DashboardWidgetContent.Type;

export const DashboardWidgetDefinition = Schema.Struct({
  id: Schema.String,
  version: Schema.String,
  title: Schema.String,
  shortDescription: Schema.optional(Schema.String),
  surfaces: Schema.Array(RecipeSurface),
  component: Schema.String,
  content: DashboardWidgetContent,
  placements: Schema.Array(DashboardWidgetPlacement),
});
export type DashboardWidgetDefinition = typeof DashboardWidgetDefinition.Type;

export function defineDashboardWidget(
  definition: DashboardWidgetDefinition,
): DashboardWidgetDefinition {
  return Schema.decodeSync(DashboardWidgetDefinition)(definition);
}
