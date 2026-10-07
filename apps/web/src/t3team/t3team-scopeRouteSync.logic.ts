import type { ProjectDashboardMode } from "~/t3team/t3team-projectDashboardModeState";
import type { ProjectMyWorkLens } from "~/t3team/t3team-projectDashboardMyWorkStateShared";
import { parseT3TeamRouteSearch, parseT3TeamViewFromPath } from "~/t3team/t3team-routeState";

/** A project-board search that keeps the active lens when the URL names one. */
export type ScopeProjectSearch =
  | { readonly projectView: ProjectDashboardMode }
  | { readonly projectView: ProjectDashboardMode; readonly myWorkLens: ProjectMyWorkLens };

/** A navigation target in the shape `router.navigate` / the footer entries use. */
export type ScopeRouteTarget =
  | { readonly to: "/t3team/my-work" }
  | { readonly to: "/t3team/my-work"; readonly search: { readonly myWorkLens: ProjectMyWorkLens } }
  | {
      readonly to: "/t3team/projects/$projectId";
      readonly params: { readonly projectId: string };
      readonly search: ScopeProjectSearch;
    };

type ScopeRouteSurface = {
  readonly mode: ProjectDashboardMode;
  readonly projectId: string | null;
  /** Set only when the URL names a lens. Absent means the destination's saved lens stays. */
  readonly lens: ProjectMyWorkLens | undefined;
};

/**
 * Project-board search for a scope pick or a section heading. A named lens rides along so the
 * destination opens on it; the route resolver still lets that URL param beat saved state. No lens
 * in the URL leaves the param off, and the destination keeps whatever it saved.
 */
export function scopeProjectSearch(
  projectView: ProjectDashboardMode,
  lens: ProjectMyWorkLens | undefined,
): ScopeProjectSearch {
  return lens === undefined ? { projectView } : { projectView, myWorkLens: lens };
}

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
  const lens = search.myWorkLens;
  if (view?.type === "all-my-work") {
    return { mode: "my-work", projectId: null, lens };
  }
  if (view?.type === "dashboard" && !view.embeddedThreadId) {
    return { mode: search.projectView ?? "my-work", projectId: view.projectId, lens };
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
 * `/t3team/my-work`). An active `myWorkLens` is carried both ways: all-projects onto the project,
 * and a project back to all-projects. The all-projects view has no backlog, so leaving a project's
 * backlog for "All projects" lands on all-projects my-work, lens included when the URL names one.
 * `scopeProjectId` is the scoped group's representative id, which the route layer remaps onto the
 * stored project — the same id the footer navigates with.
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
    if (surface.projectId === null) return null;
    return surface.lens
      ? { to: "/t3team/my-work", search: { myWorkLens: surface.lens } }
      : { to: "/t3team/my-work" };
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
    search: scopeProjectSearch(surface.mode, surface.lens),
  };
}
