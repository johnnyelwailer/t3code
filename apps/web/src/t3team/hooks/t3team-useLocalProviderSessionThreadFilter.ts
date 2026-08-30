import { useCallback, useMemo } from "react";

import { usePrimarySettings } from "~/hooks/useSettings";
import { filterLocalProviderSessionThreads } from "~/t3team/chat/t3team-externalSessionState";
import type { ProjectThread } from "~/t3team/t3team-types";

/**
 * The display-side half of the "Local provider sessions" setting: it makes the
 * toggle safe in both directions for thread lists.
 *
 * - OFF hides already-adopted local provider sessions from the lists the caller
 *   feeds through `filter` / `filterForProject`. This is HIDE, not delete: the
 *   store keeps every row, and the filter re-applies on each toggle transition,
 *   so turning the setting back on restores the rows without re-syncing.
 * - ON (or unhydrated default) passes the lists through untouched.
 *
 * Callers that RESOLVE threads (selection, open-thread lookup) intentionally
 * keep the unfiltered store, so an external session that is open while the
 * toggle turns off stays open — it just leaves the lists.
 */
export function useLocalProviderSessionThreadFilter(
  getThreadsForProject: (projectId: string) => ProjectThread[],
) {
  const show = usePrimarySettings((settings) => settings.showLocalProviderSessions ?? false);

  const filter = useCallback(
    (threads: ReadonlyArray<ProjectThread>) => filterLocalProviderSessionThreads(threads, show),
    [show],
  );
  const filterForProject = useMemo(
    () =>
      show
        ? (projectId: string) => getThreadsForProject(projectId)
        : (projectId: string) =>
            filterLocalProviderSessionThreads(getThreadsForProject(projectId), show),
    [show, getThreadsForProject],
  );

  return { show, filter, filterForProject };
}
