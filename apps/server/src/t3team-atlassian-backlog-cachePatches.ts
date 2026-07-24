import {
  type BacklogResourceRef,
  type T3TeamAtlassianBacklogCapabilities,
} from "./t3team-atlassian-backlog-cacheShared.ts";

export const patchCachedBacklogAssignee = (input: {
  readonly assigneeAccountId?: string | null;
  readonly assigneeDisplayName?: string | null;
}) => {
  const assigneeAccountId = input.assigneeAccountId ?? undefined;
  const assigneeDisplayName = input.assigneeDisplayName ?? undefined;

  if (!assigneeAccountId || !assigneeDisplayName) {
    return (item: BacklogResourceRef): BacklogResourceRef => {
      const { assignee: _assignee, assigneeAccountId: _assigneeAccountId, ...rest } = item;
      return rest;
    };
  }

  return (item: BacklogResourceRef): BacklogResourceRef => ({
    ...item,
    assignee: assigneeDisplayName,
    assigneeAccountId,
  });
};

export const patchCachedBacklogEstimate = (input: {
  readonly estimateValue: number | null;
  readonly mode: "points" | "hours";
}) => {
  const estimateValue = input.estimateValue;

  if (estimateValue === null) {
    if (input.mode === "hours") {
      return (item: BacklogResourceRef): BacklogResourceRef => {
        const { estimateValue: _estimateValue, timeOriginalEstimateSeconds: _time, ...rest } = item;
        return rest;
      };
    }

    return (item: BacklogResourceRef): BacklogResourceRef => {
      const { estimateValue: _estimateValue, ...rest } = item;
      return rest;
    };
  }

  if (input.mode === "hours") {
    return (item: BacklogResourceRef): BacklogResourceRef => ({
      ...item,
      estimateValue,
      timeOriginalEstimateSeconds: Math.round(estimateValue * 3600),
    });
  }

  return (item: BacklogResourceRef): BacklogResourceRef => ({
    ...item,
    estimateValue,
  });
};

export const patchEstimateCapabilities =
  (estimateFieldLabel: string) =>
  (capabilities: T3TeamAtlassianBacklogCapabilities): T3TeamAtlassianBacklogCapabilities => ({
    ...capabilities,
    estimateFieldLabel,
  });
