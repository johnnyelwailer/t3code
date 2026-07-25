import type { ProjectBacklogTicketContext } from "~/t3team/t3team-projectBacklogPresentation";
import {
  filterVisibleProjectBacklogTableRows,
  getProjectBacklogTableExpandableTicketIds,
  type ProjectBacklogTableGroup,
  type ProjectBacklogTableRow,
} from "~/t3team/t3team-projectBacklogTable";

export type ProjectBacklogTableVirtualGroupHeaderRow = {
  kind: "group-header";
  key: string;
  group: ProjectBacklogTableGroup;
};

export type ProjectBacklogTableVirtualTicketRow = {
  kind: "ticket";
  key: string;
  groupId: string;
  row: ProjectBacklogTableRow;
  expandableTicketIds: ReadonlySet<string>;
};

export type ProjectBacklogTableVirtualRow =
  | ProjectBacklogTableVirtualGroupHeaderRow
  | ProjectBacklogTableVirtualTicketRow;

export const projectBacklogTableVirtualRowEstimateSizeByKind = {
  "group-header": 44,
  ticket: 36,
} as const;

export function buildProjectBacklogTableVirtualRows({
  groups,
  collapsedGroupIds,
  collapsedTicketIds,
  contextByTicketId,
}: {
  groups: readonly ProjectBacklogTableGroup[];
  collapsedGroupIds: ReadonlySet<string>;
  collapsedTicketIds: ReadonlySet<string>;
  contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
}): readonly ProjectBacklogTableVirtualRow[] {
  const virtualRows: ProjectBacklogTableVirtualRow[] = [];

  for (const group of groups) {
    const showGroupHeader = group.id !== "all";
    if (showGroupHeader) {
      virtualRows.push({
        kind: "group-header",
        key: `group:${group.id}`,
        group,
      });
    }

    if (showGroupHeader && collapsedGroupIds.has(group.id)) {
      continue;
    }

    const expandableTicketIds = getProjectBacklogTableExpandableTicketIds(group.rows);
    const visibleRows = filterVisibleProjectBacklogTableRows({
      rows: group.rows,
      contextByTicketId,
      collapsedTicketIds,
    });

    for (const row of visibleRows) {
      virtualRows.push({
        kind: "ticket",
        key: `ticket:${group.id}:${row.ticket.id}`,
        groupId: group.id,
        row,
        expandableTicketIds,
      });
    }
  }

  return virtualRows;
}

export function estimateProjectBacklogTableVirtualRowSize(row: ProjectBacklogTableVirtualRow) {
  if (row.kind === "group-header") {
    return row.group.description
      ? projectBacklogTableVirtualRowEstimateSizeByKind["group-header"]
      : projectBacklogTableVirtualRowEstimateSizeByKind["group-header"] - 8;
  }

  return projectBacklogTableVirtualRowEstimateSizeByKind.ticket;
}
