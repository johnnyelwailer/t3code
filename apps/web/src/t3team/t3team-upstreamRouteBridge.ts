import type { T3TeamRouteSearchTarget } from "~/t3team/t3team-routeState";

/**
 * Upstream sidebars navigate with upstream's own route shapes (`/`,
 * `/$environmentId/$threadId`). T3 Team is the permanent shell, so those
 * locations have to resolve to the equivalent Team route instead of bouncing
 * back to the dashboard and dropping the thread.
 *
 * Translating at the route layer keeps upstream's sidebar components byte
 * identical to upstream: there are no fork-side navigation props to re-apply on
 * every sync. Anything this bridge cannot map is reported as `unhandled`, and
 * the caller falls back to the plain redirect.
 */

export type UpstreamRouteTranslation =
  | { readonly kind: "ignore" }
  | { readonly kind: "unhandled" }
  | { readonly kind: "target"; readonly target: T3TeamRouteSearchTarget };

/** Routes the Team shell deliberately leaves alone (they render outside it). */
const PASSTHROUGH_PREFIXES = ["/t3team", "/settings", "/pair", "/connect", "/connect_"] as const;

export function isT3TeamShellPath(pathname: string): boolean {
  return pathname === "/t3team" || pathname.startsWith("/t3team/");
}

function isPassthroughPath(pathname: string): boolean {
  return PASSTHROUGH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * `/$environmentId/$threadId` is upstream's thread route. Both segments are
 * opaque ids, so the shape is only recognised when there are exactly two
 * non-empty segments and neither is a known top-level route.
 */
function parseUpstreamThreadPath(
  pathname: string,
): { readonly environmentId: string; readonly threadId: string } | null {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length !== 2) {
    return null;
  }
  const [environmentId, threadId] = segments;
  if (!environmentId || !threadId) {
    return null;
  }
  return { environmentId: decodeURIComponent(environmentId), threadId: decodeURIComponent(threadId) };
}

export interface UpstreamRouteBridgeDeps {
  /**
   * Resolves the Team project a thread belongs to. Returning `null` means the
   * thread is not known to the shell yet, so the caller keeps the plain
   * redirect rather than inventing a project id.
   */
  readonly resolveProjectIdForThread: (input: {
    readonly environmentId: string;
    readonly threadId: string;
  }) => string | null;
}

export function translateUpstreamPath(
  pathname: string,
  deps: UpstreamRouteBridgeDeps,
): UpstreamRouteTranslation {
  if (isPassthroughPath(pathname)) {
    return { kind: "ignore" };
  }

  if (pathname === "/") {
    return { kind: "target", target: { to: "/t3team" } };
  }

  const threadPath = parseUpstreamThreadPath(pathname);
  if (!threadPath) {
    return { kind: "unhandled" };
  }

  const projectId = deps.resolveProjectIdForThread(threadPath);
  if (!projectId) {
    return { kind: "unhandled" };
  }

  return {
    kind: "target",
    target: {
      to: "/t3team/projects/$projectId/threads/$threadId",
      params: { projectId, threadId: threadPath.threadId },
    },
  };
}
