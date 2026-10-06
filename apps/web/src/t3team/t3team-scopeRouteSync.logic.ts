import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import { parseT3TeamRouteSearch, parseT3TeamViewFromPath } from "~/t3team/t3team-routeState";

/** A navigation target in the shape `router.navigate` / the footer entries use. */
export type ScopeRouteTarget =
  | { readonly to: "/t3team/my-work" }
  | {
      readonly to: "/t3team/projects/$projectId";
      readonly params: { readonly projectId: string };
      readonly search: { readonly projectView: ProjectDashboardMode };
    };

type ScopeRouteSurface = { readonly mode: ProjectDashboardMode; readonly projectId: string | null };

/**
 * Which "my work" / "backlog" surface a location shows, or `null` for any other route.
 *
 * Only the two board routes count: a thread, ticket, draft or a dashboard with an embedded chat
 * pane is the user's work in progress, not a scope-following surface. The all-projects view is
 * `my-work` with no project; a project dashboard with no `projectView` defaults to `my-work` (the
 * same default the route surface applies).
 */
function readScopeRouteSurface(
  pathname: string,
  rawSearch: Record<string, unknown>,
): ScopeRouteSurface | null {
  const search = parseT3TeamRouteSearch(rawSearch);
  const view = parseT3TeamViewFromPath(pathname, search);
  if (view?.type === "all-my-work") {
    return { mode: "my-work", projectId: null };
  }
  if (view?.type === "dashboard" && !view.embeddedThreadId) {
    return { mode: search.projectView ?? "my-work", projectId: view.projectId };
  }
  return null;
}

/** Which footer entry the location lights up, or `null` when it is neither board. */
export function readScopeFooterActiveEntry(
  pathname: string,
  rawSearch: Record<string, unknown>,
): ProjectDashboardMode | null {
  return readScopeRouteSurface(pathname, rawSearch)?.mode ?? null;
}

/**
 * Where the active route must go after the sidebar scope changed to `scopeProjectId` (`null` =
 * all projects), or `null` to stay put.
 *
 * Follows the footer entries' URL contract (`/t3team/projects/$id?projectView=my-work|backlog`,
 * `/t3team/my-work`). The all-projects view has no backlog, so leaving a project's backlog for
 * "All projects" lands on all-projects my-work. `scopeProjectId` is the scoped group's
 * representative id, which the route layer remaps onto the stored project — the same id the footer
 * navigates with.
 */
export function resolveScopeRouteTarget(input: {
  readonly pathname: string;
  readonly search: Record<string, unknown>;
  readonly scopeProjectId: string | null;
  /** Every project id the scoped group spans: the board may already show another member. */
  readonly scopeMemberProjectIds?: ReadonlyArray<string>;
}): ScopeRouteTarget | null {
  const surface = readScopeRouteSurface(input.pathname, input.search);
  if (surface === null) {
    return null;
  }
  if (input.scopeProjectId === null) {
    return surface.projectId === null ? null : { to: "/t3team/my-work" };
  }
  if (
    surface.projectId === input.scopeProjectId ||
    (surface.projectId !== null && input.scopeMemberProjectIds?.includes(surface.projectId))
  ) {
    return null;
  }
  return {
    to: "/t3team/projects/$projectId",
    params: { projectId: input.scopeProjectId },
    search: { projectView: surface.mode },
  };
}
