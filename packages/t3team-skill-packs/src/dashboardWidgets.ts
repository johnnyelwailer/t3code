import { defineDashboardWidget, type DashboardWidgetDefinition } from "@t3team/sdk/placements";

/**
 * The My Work digest's bundled widgets. An arrangement — the heuristic default, or one an agent
 * produced through the `arrange-my-work` recipe — places these by id; the shell renders each
 * through its registered component (`apps/web/src/t3team/t3team-dashboardWidgetRegistry.tsx`).
 */
export const BUNDLED_DASHBOARD_WIDGETS: ReadonlyArray<DashboardWidgetDefinition> = [
  defineDashboardWidget({
    id: "my-work.tickets",
    version: "1.0.0",
    title: "Tickets",
    shortDescription:
      "The viewer's tickets with their PRs, agents and people: a compact list in the side lane, " +
      "grouped by story in the main lane, a collapsed count in the footer.",
    surfaces: ["project.dashboard.myWork"],
    component: "digest-tickets",
    content: "tickets",
    placements: ["side", "main", "footer"],
  }),
  defineDashboardWidget({
    id: "my-work.reviews",
    version: "1.0.0",
    title: "Reviews owed",
    shortDescription:
      "Other people's pull requests waiting for the viewer's review, and who waits.",
    surfaces: ["project.dashboard.myWork"],
    component: "digest-reviews",
    content: "reviews",
    placements: ["side", "main"],
  }),
  defineDashboardWidget({
    id: "my-work.yesterday",
    version: "1.0.0",
    title: "Yesterday",
    shortDescription:
      "What the viewer did in the previous working day: the pull requests they merged and the " +
      "tickets of theirs that moved, each a link. Reads the digest itself, so it lists nothing.",
    surfaces: ["project.dashboard.myWork"],
    component: "digest-yesterday",
    content: "none",
    placements: ["side", "footer"],
  }),
];

export function bundledDashboardWidget(id: string): DashboardWidgetDefinition | undefined {
  return BUNDLED_DASHBOARD_WIDGETS.find((widget) => widget.id === id);
}
