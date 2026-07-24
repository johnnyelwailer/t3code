import { useCallback, useState } from "react";

import type { ProjectDashboardBacklogState } from "~/t3team/t3team-projectDashboardBacklogState";
import {
  getDefaultProjectBacklogTableSortDirection,
  type ProjectBacklogTableColumnId,
  type ProjectBacklogTableSortBy,
  type ProjectBacklogTableSortDirection,
} from "~/t3team/t3team-projectBacklogTable";

type SetProjectDashboardBacklogState = (
  value:
    | ProjectDashboardBacklogState
    | ((current: ProjectDashboardBacklogState) => ProjectDashboardBacklogState),
) => void;

function areVisibleTableColumnsEqual(
  left: readonly ProjectBacklogTableColumnId[],
  right: readonly ProjectBacklogTableColumnId[],
): boolean {
  return left.length === right.length && left.every((column, index) => column === right[index]);
}

export function useProjectDashboardBacklogTableState({
  setBacklogState,
}: {
  setBacklogState: SetProjectDashboardBacklogState;
}) {
  const [collapseGroupsRequestKey, setCollapseGroupsRequestKey] = useState(0);
  const [expandGroupsRequestKey, setExpandGroupsRequestKey] = useState(0);

  const handleTableSortByChange = useCallback(
    (nextSortBy: ProjectBacklogTableSortBy) => {
      setBacklogState((current) => {
        if (current.tableSortBy === nextSortBy) {
          return current;
        }

        return {
          ...current,
          tableSortBy: nextSortBy,
          tableSortDirection: getDefaultProjectBacklogTableSortDirection(nextSortBy),
        };
      });
    },
    [setBacklogState],
  );

  const handleTableSortDirectionChange = useCallback(
    (tableSortDirection: ProjectBacklogTableSortDirection) => {
      setBacklogState((current) => {
        if (current.tableSortDirection === tableSortDirection) {
          return current;
        }

        return { ...current, tableSortDirection };
      });
    },
    [setBacklogState],
  );

  const handleVisibleTableColumnsChange = useCallback(
    (visibleTableColumns: readonly ProjectBacklogTableColumnId[]) => {
      setBacklogState((current) => {
        if (areVisibleTableColumnsEqual(current.visibleTableColumns, visibleTableColumns)) {
          return current;
        }

        return {
          ...current,
          visibleTableColumns: [...visibleTableColumns],
        };
      });
    },
    [setBacklogState],
  );

  const requestCollapseTableGroups = useCallback(() => {
    setCollapseGroupsRequestKey((current) => current + 1);
  }, []);

  const requestExpandTableGroups = useCallback(() => {
    setExpandGroupsRequestKey((current) => current + 1);
  }, []);

  return {
    collapseGroupsRequestKey,
    expandGroupsRequestKey,
    handleTableSortByChange,
    handleTableSortDirectionChange,
    handleVisibleTableColumnsChange,
    requestCollapseTableGroups,
    requestExpandTableGroups,
  };
}
