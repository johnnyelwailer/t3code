import { useEffect } from "react";

import {
  clearReportedViewState,
  clearReportedVisibleItems,
  reportViewState,
  reportVisibleItems,
  type ReportedViewState,
} from "~/t3team/t3team-viewContextStore";
import { useFeatureFlag } from "~/t3team/t3team-useFeatureFlag";

export function useReportMyWorkViewState(input: {
  readonly projectId: string;
  readonly filters: ReportedViewState["filters"];
}) {
  const enabled = useFeatureFlag("AGENTS_VIEW_CONTEXT");
  const { projectId, filters } = input;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reports to an external store read by the thread publisher
  useEffect(() => {
    if (!enabled) return;
    reportViewState({ surface: "my-work", projectId, filters });
  }, [enabled, projectId, filters]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the report ends with the view
  useEffect(() => {
    if (!enabled) return;
    return () => clearReportedViewState(projectId);
  }, [enabled, projectId]);
}

/** `ids`: display order, after filtering; `null` reports nothing. */
export function useReportMyWorkVisibleItems(projectId: string, ids: ReadonlyArray<string> | null) {
  const enabled = useFeatureFlag("AGENTS_VIEW_CONTEXT");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reports to an external store read by the thread publisher
  useEffect(() => {
    if (!enabled || ids === null) return;
    reportVisibleItems({ projectId, ids });
  }, [enabled, projectId, ids]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the report ends with the view
  useEffect(() => {
    if (!enabled) return;
    return () => clearReportedVisibleItems(projectId);
  }, [enabled, projectId]);
}

/** The view owner's one call: its filter state, and its item ids when a list lens shows them. */
export function useReportMyWorkViewContext(input: {
  readonly projectId: string;
  readonly state: {
    readonly query: string;
    readonly lens: string;
    readonly viewMode: string;
    readonly groupMode: string;
    readonly statusCategory: string;
    readonly selectedPriority: string;
    readonly selectedStatus: string;
    readonly excludedTypeKeys: ReadonlyArray<string>;
    readonly tableSortBy: string;
    readonly tableSortDirection: string;
  };
  readonly filteredWorkItems: ReadonlyArray<{ readonly id: string }>;
}) {
  const { projectId, state, filteredWorkItems } = input;
  const { query, lens, viewMode, groupMode, statusCategory, excludedTypeKeys } = state;
  const { selectedPriority, selectedStatus, tableSortBy, tableSortDirection } = state;
  const filters = {
    query,
    lens,
    viewMode,
    groupMode,
    statusCategory,
    selectedPriority,
    selectedStatus,
    excludedTypeKeys: [...excludedTypeKeys],
    tableSortBy,
    tableSortDirection,
  };
  useReportMyWorkViewState({ projectId, filters });
  // The digest lens reports its own ids (it filters a different graph).
  const ids = lens === "digest" ? null : filteredWorkItems.map((item) => item.id);
  useReportMyWorkVisibleItems(projectId, ids);
}
