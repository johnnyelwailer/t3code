import { useRouterState, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import {
  parseProjectDashboardBacklogRouteSearch,
  readPersistedProjectDashboardBacklogState,
  resolveProjectDashboardBacklogState,
} from "~/t3team/t3team-projectDashboardBacklogState";
import type { ProjectBacklogViewMode } from "~/t3team/t3team-projectBacklogPresentation";
import { resolveT3TeamRouteSearchTarget } from "~/t3team/t3team-routeState";

/**
 * The backlog's own view mode (`?view=`), for the dashboard header. The backlog view's state hook
 * (`useProjectDashboardBacklogState`) owns the whole backlog state, persistence included; it also
 * writes every backlog param into the URL, which a header that is mounted in My Work must not do.
 * So this reads the mode the same way that hook resolves it (URL over persisted) and writes only
 * `view` — the mounted backlog view picks the change up from the URL and persists it.
 */
export function useProjectDashboardBacklogViewMode(projectId: string) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const rawSearch = useRouterState({ select: (state) => state.location.search });
  const routeTarget = useMemo(() => resolveT3TeamRouteSearchTarget(pathname), [pathname]);
  const viewMode = useMemo(
    () =>
      resolveProjectDashboardBacklogState({
        persisted: readPersistedProjectDashboardBacklogState(projectId),
        search: parseProjectDashboardBacklogRouteSearch(rawSearch as Record<string, unknown>),
      }).viewMode,
    [projectId, rawSearch],
  );
  const setViewMode = useCallback(
    (next: ProjectBacklogViewMode) => {
      if (!routeTarget) return;
      void navigate({
        ...routeTarget,
        search: (previous: Record<string, unknown>) => ({ ...previous, view: next }),
        replace: true,
      });
    },
    [navigate, routeTarget],
  );
  return { viewMode, setViewMode };
}
