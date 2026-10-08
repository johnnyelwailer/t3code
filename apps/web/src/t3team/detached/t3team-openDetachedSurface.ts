/**
 * The one way the app opens a detached surface (see `@t3tools/shared/t3team-detachedSurface`).
 *
 * The same `window.open` serves both shells: a browser opens a tab, and the desktop's
 * window-open handler turns a detached-surface request into an app window — same session, same
 * preload — that can go full screen on its own. Nothing here mints credentials or reaches for
 * the system browser; the new page is same-origin, so it is already signed in.
 */
import {
  appRoutePathname,
  detachedSurfaceUrl,
  detachedSurfaceWindowName,
  isDetachedSurfacePath,
  type DetachedSurfaceRequest,
} from "@t3tools/shared/t3team-detachedSurface";

import { isElectron } from "~/env";

export type { DetachedSurfaceRequest } from "@t3tools/shared/t3team-detachedSurface";

/** What the control that detaches a surface says, in the words of the shell it runs in. */
export const DETACH_SURFACE_LABEL = isElectron ? "Open in new window" : "Open in new tab";

export function openDetachedSurface(request: DetachedSurfaceRequest): void {
  // The desktop renderer routes by hash (main.tsx), so its detached page must too.
  const url = detachedSurfaceUrl(window.location.href, request, isElectron ? "hash" : "path");
  // `noopener` keeps the new page out of this one's process and history: it is its own app,
  // and a crash or a heavy diff over there must not take this window with it.
  window.open(url, detachedSurfaceWindowName(request), "noopener");
}

/**
 * Whether this page is itself a detached surface. Fixed for the life of the page: a detached
 * window never navigates back into the app shell, so surfaces read it once to drop the
 * "detach" control (there is nowhere further to detach to) and any chrome that assumes a shell.
 */
export function isDetachedSurfaceWindow(): boolean {
  // A page without a location (a test renderer, say) is not a detached surface.
  const href = typeof window === "undefined" ? undefined : window.location?.href;
  return typeof href === "string" && isDetachedSurfacePath(appRoutePathname(new URL(href)));
}
