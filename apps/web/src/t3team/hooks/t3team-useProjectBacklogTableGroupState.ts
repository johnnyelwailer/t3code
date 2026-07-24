import { useCallback, useEffect, useEffectEvent, useState } from "react";

import type { ProjectBacklogTableGroupBy } from "~/t3team/t3team-projectBacklogTable";

export function useProjectBacklogTableGroupState({
  groupIds,
  groupBy,
  collapseGroupsRequestKey,
  expandGroupsRequestKey,
}: {
  groupIds: readonly string[];
  groupBy: ProjectBacklogTableGroupBy;
  collapseGroupsRequestKey: number;
  expandGroupsRequestKey: number;
}) {
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setCollapsedGroupIds(new Set());
  }, [groupBy]);

  const collapseAllGroups = useEffectEvent(() => {
    setCollapsedGroupIds(new Set(groupIds));
  });

  useEffect(() => {
    if (collapseGroupsRequestKey === 0) {
      return;
    }

    collapseAllGroups();
  }, [collapseGroupsRequestKey]);

  useEffect(() => {
    if (expandGroupsRequestKey === 0) {
      return;
    }

    setCollapsedGroupIds(new Set());
  }, [expandGroupsRequestKey]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  return {
    collapsedGroupIds,
    toggleGroup,
  };
}
