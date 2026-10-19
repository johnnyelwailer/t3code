/**
 * "Open in new window" for a whole routed view: the request for the view at a location, and the
 * one call that opens it. The view opens on the route the reader is on — path, params and search
 * (lens, filters, embedded chat) — and its window is keyed by the route's path, so asking twice
 * brings the existing window forward.
 */
import { detachedViewRequest } from "@t3tools/shared/t3team-detachedView";
import type { DetachedSurfaceRequest } from "@t3tools/shared/t3team-detachedSurface";

import { openDetachedSurface } from "./t3team-openDetachedSurface";
import { undockPolicyForPath } from "./t3team-undockableViews";
import { isUndockedWindow } from "./t3team-undockedWindow";

export interface UndockLocation {
  readonly pathname: string;
  /** The raw query string, with or without its leading `?`. */
  readonly searchStr: string;
}

/** The window title for the view at a location, or null when that view does not undock. */
export function undockViewTitle(location: UndockLocation): string | null {
  const match = undockPolicyForPath(location.pathname);
  if (match === null || !match.policy.undock) return null;
  return match.policy.title({
    segments: match.segments,
    search: new URLSearchParams(location.searchStr),
  });
}

export function undockViewRequest(location: UndockLocation): DetachedSurfaceRequest | null {
  const title = undockViewTitle(location);
  if (title === null) return null;
  const search = location.searchStr.replace(/^\?/, "");
  return detachedViewRequest({
    route: `${location.pathname}${search === "" ? "" : `?${search}`}`,
    title,
  });
}

/**
 * Whether this page offers to undock its views. An undocked window does not: it is already a
 * window of its own (its panels can still detach into further windows).
 */
export function canUndockViews(): boolean {
  return !isUndockedWindow();
}

/** Opens the view at `location` in a window (desktop) or tab (web); false when it cannot. */
export function undockView(location: UndockLocation): boolean {
  if (!canUndockViews()) return false;
  const request = undockViewRequest(location);
  if (request === null) return false;
  openDetachedSurface(request);
  return true;
}
