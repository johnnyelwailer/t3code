/**
 * Which right-panel tabs can be moved into a window of their own, and what to ask for when one
 * is. A tab kind joins by returning a request here and registering a view for that request's
 * kind in `t3team-detachedSurfaceKinds`; the tab strip's context menu offers the move for every
 * tab this returns a request for.
 */
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import type { DetachedSurfaceRequest } from "@t3tools/shared/t3team-detachedSurface";

import { pullRequestDetachedSurfaceRequest } from "~/components/pullRequest/t3team-pullRequestDetachedSurface.logic";
import type { RightPanelSurface } from "~/rightPanelStore";

export function detachedSurfaceRequestForRightPanelSurface(
  surface: RightPanelSurface,
  /** The panel's own environment, for surfaces that do not carry one. */
  panelEnvironmentId: EnvironmentId | null,
): DetachedSurfaceRequest | null {
  switch (surface.kind) {
    case "pull-request": {
      const environmentId = (surface.environmentId as EnvironmentId | undefined) ?? panelEnvironmentId;
      if (environmentId === null) return null;
      return pullRequestDetachedSurfaceRequest({
        environmentId,
        reference: {
          projectId: surface.projectId as ProjectId,
          repository: surface.repository,
          number: surface.number,
          ...(surface.host ? { host: surface.host } : {}),
        },
        view: { tab: "summary", file: null },
        title: null,
      });
    }
    default:
      return null;
  }
}
