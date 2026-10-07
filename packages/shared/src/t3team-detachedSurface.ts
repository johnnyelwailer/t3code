/**
 * A detached surface: one panel of the app opened by itself, in a window of its own on the
 * desktop and in a browser tab on the web, so it can take a whole screen (or a second one).
 *
 * The surface is addressed by an ordinary same-origin URL — `/t3team/detached/<kind>?…` — so
 * both shells open it the same way: the renderer calls `window.open`, the browser makes a tab,
 * and the desktop's window-open handler recognises the URL and the window name and makes an
 * app window instead of handing it to the system browser (which cannot load the app's own
 * scheme, and is why the old "Open in new tab" never opened anything on the desktop).
 *
 * Both the renderer and the desktop main process read this module, so the two cannot disagree
 * about what a detached-surface request looks like.
 *
 * @module detachedSurface
 */

/** Where the app serves detached surfaces. The kind follows as the next path segment. */
export const DETACHED_SURFACE_PATH_PREFIX = "/t3team/detached/";

/**
 * The `window.open` target every detached surface uses. The desktop keys its windows by it, so
 * opening a surface that is already detached brings its window forward instead of adding another.
 */
export const DETACHED_SURFACE_WINDOW_NAME_PREFIX = "t3team-detached:";

/** The search key the surface's window title travels in. Every other key belongs to the kind. */
export const DETACHED_SURFACE_TITLE_PARAM = "title";

const KIND_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const MAX_TITLE_LENGTH = 200;
const MAX_KEY_LENGTH = 400;

export interface DetachedSurfaceRequest {
  /** Which surface to render; a kind the app does not know renders an explanation, not a crash. */
  readonly kind: string;
  /**
   * What makes this surface this one — a pull request's host, repository and number, say. Two
   * requests with the same kind and key are the same window.
   */
  readonly key: string;
  /** The kind's own parameters. Strings only: they travel in a URL. */
  readonly params: Readonly<Record<string, string>>;
  /** Shown as the window title (desktop) or tab title (web). */
  readonly title: string;
}

export function isDetachedSurfaceKind(value: string): boolean {
  return KIND_PATTERN.test(value);
}

/** The app-relative URL (path and search) that renders the requested surface. */
export function detachedSurfacePath(request: DetachedSurfaceRequest): string {
  if (!isDetachedSurfaceKind(request.kind)) {
    throw new Error(`Not a detached surface kind: ${JSON.stringify(request.kind)}`);
  }
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(request.params)) {
    if (name !== DETACHED_SURFACE_TITLE_PARAM) search.set(name, value);
  }
  const title = request.title.trim().slice(0, MAX_TITLE_LENGTH);
  if (title !== "") search.set(DETACHED_SURFACE_TITLE_PARAM, title);
  const query = search.toString();
  return `${DETACHED_SURFACE_PATH_PREFIX}${request.kind}${query === "" ? "" : `?${query}`}`;
}

/** The `window.open` target for a request; see {@link DETACHED_SURFACE_WINDOW_NAME_PREFIX}. */
export function detachedSurfaceWindowName(
  request: Pick<DetachedSurfaceRequest, "kind" | "key">,
): string {
  return `${DETACHED_SURFACE_WINDOW_NAME_PREFIX}${request.kind}:${request.key.slice(0, MAX_KEY_LENGTH)}`;
}

/** The kind a pathname renders, or null when the pathname is not a detached surface. */
export function detachedSurfaceKindFromPath(pathname: string): string | null {
  if (!pathname.startsWith(DETACHED_SURFACE_PATH_PREFIX)) return null;
  const kind = pathname.slice(DETACHED_SURFACE_PATH_PREFIX.length).replace(/\/+$/, "");
  return isDetachedSurfaceKind(kind) ? kind : null;
}

export function isDetachedSurfacePath(pathname: string): boolean {
  return detachedSurfaceKindFromPath(pathname) !== null;
}

/**
 * Whether a `window.open` the app's renderer made is a request for a detached surface: the
 * app's own origin, a detached-surface path, and the detached-surface window name. All three,
 * so neither a link that happens to share the path nor a page that borrows the name qualifies.
 */
export function isDetachedSurfaceWindowRequest(input: {
  readonly applicationUrl: string;
  readonly url: string;
  readonly frameName: string;
}): boolean {
  if (!input.frameName.startsWith(DETACHED_SURFACE_WINDOW_NAME_PREFIX)) return false;
  try {
    const url = new URL(input.url);
    return (
      url.origin === new URL(input.applicationUrl).origin && isDetachedSurfacePath(url.pathname)
    );
  } catch {
    return false;
  }
}
