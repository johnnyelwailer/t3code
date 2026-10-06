import { useCallback, useMemo } from "react";

import { setSortedStringMembership } from "~/t3team/hooks/t3team-projectMyWorkStateHelpers";
import type { ProjectDashboardKanbanColumnCollapse } from "~/t3team/t3team-projectDashboardKanbanCollapse";
import type { ProjectDashboardMyWorkState } from "~/t3team/t3team-projectDashboardMyWorkState";

/**
 * The board's collapse state as the one prop the kanban takes. It is written through the My Work
 * state's own setter, so it persists per project beside the rest of the view's settings.
 */
export function useProjectKanbanColumnCollapse({
  state: { collapsedKanbanColumnIds },
  setState,
}: {
  state: Pick<ProjectDashboardMyWorkState, "collapsedKanbanColumnIds">;
  setState: (update: (current: ProjectDashboardMyWorkState) => ProjectDashboardMyWorkState) => void;
}): ProjectDashboardKanbanColumnCollapse {
  const onToggle = useCallback(
    (columnId: string, collapsed: boolean) =>
      setState((current) => ({
        ...current,
        collapsedKanbanColumnIds: setSortedStringMembership(
          current.collapsedKanbanColumnIds,
          columnId,
          collapsed,
        ),
      })),
    [setState],
  );
  return useMemo(
    () => ({ collapsedIds: new Set(collapsedKanbanColumnIds), onToggle }),
    [collapsedKanbanColumnIds, onToggle],
  );
}
