import type {
  ProjectDashboardMyWorkRouteSearch,
  ProjectMyWorkLens,
} from "./t3team-projectDashboardMyWorkStateShared";

/**
 * The URL decides the My Work lens. `myWorkLens` names it directly and is written back on every
 * lens change. A link that carries only the view params (`?myWorkView=kanban&myWorkGroup=hierarchy`)
 * still asks for a non-digest view, so it maps to the lens that renders that view instead of being
 * silently ignored under a persisted digest lens.
 *
 * Builds before `myWorkLens` mirrored the WHOLE My Work state into every URL — default
 * `myWorkView=kanban` included, sort keys always present. Such a URL says nothing about the lens,
 * so it keeps the persisted one; reading it as a board request would overwrite a saved digest.
 */
export function resolveProjectMyWorkLensFromRouteSearch(
  search: ProjectDashboardMyWorkRouteSearch,
): ProjectMyWorkLens | undefined {
  if (search.myWorkLens !== undefined) return search.myWorkLens;
  const isLegacyMirroredState = search.myWorkSort !== undefined || search.myWorkDir !== undefined;
  if (isLegacyMirroredState) return undefined;
  if (search.myWorkView === "kanban") return "board";
  if (search.myWorkView !== undefined || search.myWorkGroup !== undefined) return "hierarchy";
  return undefined;
}
