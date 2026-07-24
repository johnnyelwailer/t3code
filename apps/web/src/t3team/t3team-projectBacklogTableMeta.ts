import type { ProjectBacklogPlanningState } from "./t3team-projectBacklogPresentation";

export type ProjectBacklogTableGroupBy =
  | "none"
  | "planning-state"
  | "sprint"
  | "assignee"
  | "status"
  | "issue-type"
  | "parent";

export type ProjectBacklogTableSortBy =
  | "rank"
  | "key"
  | "title"
  | "status"
  | "assignee"
  | "estimate"
  | "updated";

export type ProjectBacklogTableSortDirection = "asc" | "desc";

export type ProjectBacklogTableColumnId =
  | "status"
  | "assignee"
  | "estimate"
  | "parent"
  | "updated"
  | "issue-type"
  | "subtasks";

export const projectBacklogTableGroupOptions: ReadonlyArray<{
  value: ProjectBacklogTableGroupBy;
  label: string;
}> = [
  { value: "none", label: "No grouping" },
  { value: "planning-state", label: "Planning state" },
  { value: "sprint", label: "Sprint" },
  { value: "assignee", label: "Assignee" },
  { value: "status", label: "Status" },
  { value: "issue-type", label: "Issue type" },
  { value: "parent", label: "Parent" },
];

export const projectBacklogTableSortOptions: ReadonlyArray<{
  value: ProjectBacklogTableSortBy;
  label: string;
}> = [
  { value: "rank", label: "Priority rank" },
  { value: "updated", label: "Updated" },
  { value: "estimate", label: "Estimate" },
  { value: "key", label: "Issue key" },
  { value: "title", label: "Title" },
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
];

export const defaultProjectBacklogTableVisibleColumns = [
  "status",
  "assignee",
  "estimate",
] as const satisfies readonly ProjectBacklogTableColumnId[];

export const projectBacklogTableColumnOptions: ReadonlyArray<{
  value: ProjectBacklogTableColumnId;
  label: string;
}> = [
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "estimate", label: "Estimate" },
  { value: "parent", label: "Parent" },
  { value: "updated", label: "Updated" },
  { value: "issue-type", label: "Issue type" },
  { value: "subtasks", label: "Subtasks" },
];

export const projectBacklogTableColumnValues = new Set<ProjectBacklogTableColumnId>(
  projectBacklogTableColumnOptions.map((option) => option.value),
);

export const projectBacklogTablePlanningStateOrder: Record<ProjectBacklogPlanningState, number> = {
  "needs-owner-and-estimate": 0,
  "needs-owner": 1,
  "needs-estimate": 2,
  ready: 3,
};

export function getDefaultProjectBacklogTableSortDirection(
  sortBy: ProjectBacklogTableSortBy,
): ProjectBacklogTableSortDirection {
  return sortBy === "rank" || sortBy === "estimate" || sortBy === "updated" ? "desc" : "asc";
}
