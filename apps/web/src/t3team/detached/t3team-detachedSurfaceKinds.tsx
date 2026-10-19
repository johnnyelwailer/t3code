/**
 * Every surface the app can detach, by kind. Making another panel detachable is one entry here
 * (a component that renders the panel from its params) plus a {@link DetachSurfaceButton} — or
 * any other call to `openDetachedSurface` — on the panel itself.
 */
import { DETACHED_VIEW_KIND } from "@t3tools/shared/t3team-detachedView";
import type { ComponentType } from "react";

import { PULL_REQUEST_DETACHED_SURFACE_KIND } from "~/components/pullRequest/t3team-pullRequestDetachedSurface.logic";
import { PullRequestDetachedSurfaceView } from "~/components/pullRequest/t3team-PullRequestDetachedSurfaceView";

import { DetachedViewHandover } from "./t3team-DetachedViewHandover";

export interface DetachedSurfaceViewProps {
  /** The request's params, as the page's URL carries them now. */
  readonly params: Readonly<Record<string, string>>;
  /**
   * Writes the surface's live state back into the page URL (undefined removes a key), so a
   * reload of the detached window — or a copy of its address — lands where the reader is.
   */
  readonly onParamsChange: (patch: Readonly<Record<string, string | undefined>>) => void;
}

const DETACHED_SURFACE_VIEWS: Readonly<Record<string, ComponentType<DetachedSurfaceViewProps>>> = {
  [PULL_REQUEST_DETACHED_SURFACE_KIND]: PullRequestDetachedSurfaceView,
  [DETACHED_VIEW_KIND]: DetachedViewHandover,
};

export function detachedSurfaceView(
  kind: string,
): ComponentType<DetachedSurfaceViewProps> | undefined {
  return Object.hasOwn(DETACHED_SURFACE_VIEWS, kind) ? DETACHED_SURFACE_VIEWS[kind] : undefined;
}
