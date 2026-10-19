/**
 * An undocked view: a whole routed view of the app (My Work, a work item, a thread, Usage…)
 * opened in a window of its own, as a detached surface (`./t3team-detachedSurface`) of the kind
 * {@link DETACHED_VIEW_KIND}.
 *
 * The request names the route it is for, and the detached page hands the window over to that
 * route: the window then runs the real view, with its own route params, loaders and live state,
 * minus the app's navigation chrome. Its window is keyed by the route, so asking again for a
 * view that is already undocked brings its window forward.
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
  return {
    kind: DETACHED_VIEW_KIND,
    key: route,
    params: { [DETACHED_VIEW_PATH_PARAM]: route },
    title: input.title,
  };
}

/**
 * The URL a detached-surface window shows once it has loaded `url`: for an undocked view, the
 * view's own route, in the routing form `url` uses; any other surface stays on its URL. The
 * desktop compares a window's current URL against this, so asking again for a view that is
 * already showing only brings its window forward instead of loading it afresh.
 */
export function detachedSurfaceLandingUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const routing = parsed.hash.startsWith("#/") ? "hash" : "path";
  if (detachedSurfaceKindFromPath(appRoutePathname(parsed)) !== DETACHED_VIEW_KIND) return url;
  const search = new URLSearchParams(routing === "hash" ? hashQuery(parsed.hash) : parsed.search);
  const route = detachedViewRoute(search.get(DETACHED_VIEW_PATH_PARAM) ?? undefined);
  if (route === null) return url;
  return routing === "hash" ? new URL(`/#${route}`, parsed).href : new URL(route, parsed).href;
}

function hashQuery(hash: string): string {
  const queryAt = hash.indexOf("?");
  return queryAt === -1 ? "" : hash.slice(queryAt + 1);
}
