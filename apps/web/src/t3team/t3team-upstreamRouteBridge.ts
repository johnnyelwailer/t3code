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
const PASSTHROUGH_PREFIXES = ["/t3team", "/settings", "/pair"] as const;

export function isT3TeamShellPath(pathname: string): boolean {
  return pathname === "/t3team" || pathname.startsWith("/t3team/");
}

function isPassthroughPath(pathname: string): boolean {
  return PASSTHROUGH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * `/draft/$draftId` is upstream's new-thread route, and it collides with the
 * two-segment thread shape below: without a draft branch a draft id is read as a
 * thread id in an environment called "draft", never resolves to a project, and
 * the whole new-thread action degrades into a redirect back to the dashboard.
 *
 * `environmentId` is an opaque non-empty string, so an environment could in
 * principle be called "draft". Thread resolution therefore runs first and wins:
 * a path that names a real thread is always treated as that thread, and only an
 * unresolvable `/draft/<id>` is read as a draft. Draft ids and thread ids are
 * independently generated uuids, so a draft never collides with a real thread.
 */
const UPSTREAM_DRAFT_SEGMENT = "draft";

function parseUpstreamDraftPath(pathname: string): { readonly draftId: string } | null {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length !== 2 || segments[0] !== UPSTREAM_DRAFT_SEGMENT || !segments[1]) {
    return null;
  }
  return { draftId: decodeURIComponent(segments[1]) };
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
  return {
    environmentId: decodeURIComponent(environmentId),
    threadId: decodeURIComponent(threadId),
  };
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
  const projectId = threadPath ? deps.resolveProjectIdForThread(threadPath) : null;

  // A real thread always wins, so an environment literally named "draft" keeps
  // working; only an unresolvable `/draft/<id>` is treated as a draft.
  if (!projectId) {
    const draftPath = parseUpstreamDraftPath(pathname);
    if (draftPath) {
      return {
        kind: "target",
        target: { to: "/t3team/drafts/$draftId", params: { draftId: draftPath.draftId } },
      };
    }
  }

  if (!threadPath || !projectId) {
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
