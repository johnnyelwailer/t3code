import { compareProjectBacklogTickets } from "./t3team-projectBacklogUtils";
import type {
  ProjectBacklogTableSortBy,
  ProjectBacklogTableSortDirection,
} from "./t3team-projectBacklogTableMeta";
import type { ProjectTicket } from "./t3team-types";

function compareLabels(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function compareEstimateValues(
  left: number | undefined,
  right: number | undefined,
  sortDirection: ProjectBacklogTableSortDirection,
): number {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return sortDirection === "asc" ? left - right : right - left;
}

export function sortProjectBacklogTableTickets({
  tickets,
  sortBy,
  sortDirection,
}: {
  tickets: readonly ProjectTicket[];
  sortBy: ProjectBacklogTableSortBy;
  sortDirection: ProjectBacklogTableSortDirection;
}): ProjectTicket[] {
  return [...tickets].sort((left, right) => {
    if (sortBy === "rank") {
      return sortDirection === "desc"
        ? compareProjectBacklogTickets(left, right)
        : compareProjectBacklogTickets(right, left);
    }

    if (sortBy === "estimate") {
      const estimateDelta = compareEstimateValues(
        left.estimateValue,
        right.estimateValue,
        sortDirection,
      );
      if (estimateDelta !== 0) return estimateDelta;
      return compareProjectBacklogTickets(left, right);
    }

    const direction = sortDirection === "asc" ? 1 : -1;
    if (sortBy === "updated") {
      const updatedDelta = Date.parse(left.updatedAt) - Date.parse(right.updatedAt);
      if (!Number.isNaN(updatedDelta) && updatedDelta !== 0) return updatedDelta * direction;
      return compareProjectBacklogTickets(left, right);
    }

    const leftValue =
      sortBy === "key"
        ? left.ref.displayId
        : sortBy === "title"
          ? left.ref.title
          : sortBy === "status"
            ? left.status
            : left.assignee?.trim() || "Unassigned";
    const rightValue =
      sortBy === "key"
        ? right.ref.displayId
        : sortBy === "title"
          ? right.ref.title
          : sortBy === "status"
            ? right.status
            : right.assignee?.trim() || "Unassigned";
    const labelDelta = compareLabels(leftValue, rightValue);
    if (labelDelta !== 0) return labelDelta * direction;
    return compareProjectBacklogTickets(left, right);
  });
}
