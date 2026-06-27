import {
  projectBacklogFocusFilterValues,
  projectBacklogTableGroupByValues,
  projectBacklogTableSortByValues,
  projectBacklogTableSortDirectionValues,
  projectBacklogViewModeValues,
  type ProjectDashboardBacklogRouteSearch,
} from "./t3work-projectDashboardBacklogStateShared";
import { parseRouteEnum } from "./t3work-projectDashboardBacklogStateRouteUtils";

function normalizeRouteString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim().length > 0 ? value.trim() : undefined;
}

export function parseProjectDashboardBacklogRouteSearch(
  search: Record<string, unknown>,
): ProjectDashboardBacklogRouteSearch {
  const parsed: ProjectDashboardBacklogRouteSearch = {};

  if (typeof search.q === "string") {
    parsed.q = search.q;
  }

  const focus = parseRouteEnum(search.focus, projectBacklogFocusFilterValues);
  if (focus !== undefined) {
    parsed.focus = focus;
  }

  if (typeof search.assignee === "string") {
    parsed.assignee = search.assignee;
  }

  if (typeof search.assigneeScope === "string") {
    parsed.assigneeScope = search.assigneeScope;
  }

  if (typeof search.issueTypes === "string") {
    parsed.issueTypes = search.issueTypes;
  }

  const view = parseRouteEnum(search.view, projectBacklogViewModeValues);
  if (view !== undefined) {
    parsed.view = view;
  }

  const group = parseRouteEnum(search.group, projectBacklogTableGroupByValues);
  if (group !== undefined) {
    parsed.group = group;
  }

  const sort = parseRouteEnum(search.sort, projectBacklogTableSortByValues);
  if (sort !== undefined) {
    parsed.sort = sort;
  }

  const dir = parseRouteEnum(search.dir, projectBacklogTableSortDirectionValues);
  if (dir !== undefined) {
    parsed.dir = dir;
  }

  const board = normalizeRouteString(search.board);
  if (board !== undefined) {
    parsed.board = board;
  }

  const sprint = normalizeRouteString(search.sprint);
  if (sprint !== undefined) {
    parsed.sprint = sprint;
  }

  const jiraFilter = normalizeRouteString(search.jiraFilter);
  if (jiraFilter !== undefined) {
    parsed.jiraFilter = jiraFilter;
  }

  return parsed;
}
