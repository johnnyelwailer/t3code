import {
  projectBacklogTableColumnOptions,
  type ProjectBacklogTableColumnId,
  type ProjectBacklogTableSortBy,
} from "~/t3team/t3team-projectBacklogTable";

export const projectBacklogTableColumnWidthById: Record<
  "issue" | ProjectBacklogTableColumnId | "actions",
  number
> = {
  issue: 500,
  status: 160,
  assignee: 220,
  estimate: 128,
  parent: 220,
  updated: 136,
  "issue-type": 156,
  subtasks: 104,
  actions: 52,
};

const projectBacklogTableColumnLabelById: Record<ProjectBacklogTableColumnId, string> = {
  status: "Status",
  assignee: "Assignee",
  estimate: "Estimate",
  parent: "Parent",
  updated: "Updated",
  "issue-type": "Issue type",
  subtasks: "Subtasks",
};

const projectBacklogSortableTableColumnById: Partial<
  Record<ProjectBacklogTableColumnId, ProjectBacklogTableSortBy>
> = {
  status: "status",
  assignee: "assignee",
  estimate: "estimate",
  updated: "updated",
};

export function resolveProjectBacklogTableVisibleColumns(
  visibleColumns: readonly ProjectBacklogTableColumnId[],
) {
  return visibleColumns.flatMap((columnId) => {
    const option = projectBacklogTableColumnOptions.find(
      (candidate) => candidate.value === columnId,
    );
    return option ? [option] : [];
  });
}

export function getProjectBacklogTableMinWidth(
  visibleColumns: readonly ProjectBacklogTableColumnId[],
): number {
  return (
    projectBacklogTableColumnWidthById.issue +
    visibleColumns.reduce(
      (sum, columnId) => sum + projectBacklogTableColumnWidthById[columnId],
      0,
    ) +
    projectBacklogTableColumnWidthById.actions
  );
}

export function getProjectBacklogTableColumnHeaderLabel(
  columnId: ProjectBacklogTableColumnId,
  estimateFieldLabel?: string,
): string {
  return columnId === "estimate"
    ? (estimateFieldLabel ?? "Estimate")
    : projectBacklogTableColumnLabelById[columnId];
}

export function getProjectBacklogTableColumnSortBy(columnId: ProjectBacklogTableColumnId) {
  return projectBacklogSortableTableColumnById[columnId];
}
