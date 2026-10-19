/**
 * An undocked view: a whole routed view of the app (My Work, a work item, a thread, Usage…)
 * opened in a window of its own, as a detached surface (`./t3team-detachedSurface`) of the kind
 * {@link DETACHED_VIEW_KIND}.
 *
 * The request names the route it is for, and the detached page hands the window over to that
 * route: the window then runs the real view, with its own route params, loaders and live state,
 * minus the app's navigation chrome. Its window is keyed by the route's path — one window per
 * view, whatever its search (lens, filters) — so asking again for a view that is already
 * undocked brings its window forward, on the newly asked search.
 *
 * Both the renderer and the desktop main process read this module.
 *
 * @module detachedView
 */
import {
  appRoutePathname,
  detachedSurfaceKindFromPath,
  isDetachedSurfacePath,
  type DetachedSurfaceRequest,
} from "./t3team-detachedSurface.ts";

export const DETACHED_VIEW_KIND = "view";

/** The search key the undocked route travels in: its app-relative path and search. */
export const DETACHED_VIEW_PATH_PARAM = "path";

const MAX_VIEW_PATH_LENGTH = 2000;
const PARSE_BASE = "http://app.invalid";

/**
 * The app-relative route a detached view addresses, or null when the value is not one: a path
 * on the app's own origin (never `//host` or a scheme), and not itself a detached surface, which
 * would hand the window back to itself.
 */
export function detachedViewRoute(value: string | undefined): string | null {
  if (value === undefined || value.length > MAX_VIEW_PATH_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  let parsed: URL;
  try {
    parsed = new URL(value, PARSE_BASE);
  } catch {
    return null;
  }
  if (parsed.origin !== PARSE_BASE || isDetachedSurfacePath(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}`;
}

/** The request that undocks the view at `route` (an app-relative path and search). */
export function detachedViewRequest(input: {
  readonly route: string;
  readonly title: string;
}): DetachedSurfaceRequest {
  const route = detachedViewRoute(input.route);
  if (route === null) throw new Error(`Not an undockable route: ${JSON.stringify(input.route)}`);
  const queryAt = route.indexOf("?");
  return {
    kind: DETACHED_VIEW_KIND,
    key: queryAt === -1 ? route : route.slice(0, queryAt),
    params: { [DETACHED_VIEW_PATH_PARAM]: route },
    title: input.title,
  };
}

/**
 * Whether a detached-surface window now at `currentUrl` already shows what `requestUrl` asks
 * for, so asking again only brings it forward. An undocked view counts as shown while its window
 * is on the view's route path, whatever search the window has moved on to (its own lens and
 * filters are its own); any other surface, while its window is on the requested URL.
 */
export function isDetachedSurfaceShowing(currentUrl: string, requestUrl: string): boolean {
  if (currentUrl === requestUrl) return true;
  let current: URL;
  let request: URL;
  try {
    current = new URL(currentUrl);
    request = new URL(requestUrl);
  } catch {
    return false;
  }
  if (detachedSurfaceKindFromPath(appRoutePathname(request)) !== DETACHED_VIEW_KIND) return false;
  const routing = request.hash.startsWith("#/") ? "hash" : "path";
  const search = new URLSearchParams(routing === "hash" ? hashQuery(request.hash) : request.search);
  const route = detachedViewRoute(search.get(DETACHED_VIEW_PATH_PARAM) ?? undefined);
  if (route === null) return false;
  const queryAt = route.indexOf("?");
  return appRoutePathname(current) === (queryAt === -1 ? route : route.slice(0, queryAt));
}

function hashQuery(hash: string): string {
  const queryAt = hash.indexOf("?");
  return queryAt === -1 ? "" : hash.slice(queryAt + 1);
}
