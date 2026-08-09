import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";

import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { useProjectBacklogTableGroupState } from "~/t3team/hooks/t3team-useProjectBacklogTableGroupState";
import { ProjectBacklogTableColGroup } from "~/t3team/t3team-ProjectBacklogTableColGroup";
import { ProjectBacklogTableHeader } from "~/t3team/t3team-ProjectBacklogTableHeader";
import { ProjectBacklogTableVirtualBody } from "~/t3team/t3team-ProjectBacklogTableVirtualBody";
import type { AtlassianAssignableUser, AtlassianChildIssueType } from "~/t3team/backend/t3team-types";
import type { ProjectBacklogTicketContext } from "~/t3team/t3team-projectBacklogPresentation";
import {
  buildProjectBacklogTableGroups,
  type ProjectBacklogTableColumnId,
  type ProjectBacklogTableGroupBy,
  type ProjectBacklogTableSortBy,
  type ProjectBacklogTableSortDirection,
} from "~/t3team/t3team-projectBacklogTable";
import {
  buildProjectBacklogTableVirtualRows,
  estimateProjectBacklogTableVirtualRowSize,
} from "~/t3team/t3team-projectBacklogTableVirtualRows";
import { getProjectBacklogTableMinWidth } from "~/t3team/t3team-projectBacklogTableViewMeta";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3team/t3team-types";

const PROJECT_BACKLOG_TABLE_VIRTUAL_OVERSCAN = 12;

export const ProjectBacklogTableView = memo(function ProjectBacklogTableView({
  projectId,
  tickets,
  contextByTicketId,
  groupBy,
  sortBy,
  sortDirection,
  visibleColumns,
  collapseGroupsRequestKey,
  expandGroupsRequestKey,
  estimateFieldLabel,
  canCreateSubtasks,
  onTicketContextMenu,
  getTicketAgentContext,
  onOpenTicket,
  onSearchAssignableUsers,
  onListChildIssueTypes,
  onUpdateAssignee,
  onUpdateEstimate,
  onCreateSubtask,
  onSortByChange,
  onSortDirectionChange,
}: {
  projectId: string;
  tickets: readonly ProjectTicket[];
  contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
  groupBy: ProjectBacklogTableGroupBy;
  sortBy: ProjectBacklogTableSortBy;
  sortDirection: ProjectBacklogTableSortDirection;
  visibleColumns: readonly ProjectBacklogTableColumnId[];
  collapseGroupsRequestKey: number;
  expandGroupsRequestKey: number;
  estimateFieldLabel?: string;
  canCreateSubtasks: boolean;
  onTicketContextMenu: (event: MouseEvent, ticket: ProjectTicket) => void;
  getTicketAgentContext: (ticket: ProjectTicket) => AgentContextCapabilities | null;
  onOpenTicket: (projectId: string, ticketId: string) => void;
  onSearchAssignableUsers: (
    ticket: ProjectTicket,
    query?: string,
  ) => Promise<ReadonlyArray<AtlassianAssignableUser>>;
  onListChildIssueTypes?: () => Promise<ReadonlyArray<AtlassianChildIssueType>>;
  onUpdateAssignee: (
    ticket: ProjectTicket,
    assignee: AtlassianAssignableUser | null,
  ) => Promise<void>;
  onUpdateEstimate: (ticket: ProjectTicket, estimateValue: number | null) => Promise<void>;
  onCreateSubtask: (
    ticket: ProjectTicket,
    subtask: ProjectBacklogSubtaskCreateInput,
  ) => Promise<void>;
  onSortByChange: (value: ProjectBacklogTableSortBy) => void;
  onSortDirectionChange: (value: ProjectBacklogTableSortDirection) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [collapsedTicketIds, setCollapsedTicketIds] = useState<ReadonlySet<string>>(new Set());

  const groups = useMemo(
    () =>
      buildProjectBacklogTableGroups({
        tickets,
        contextByTicketId,
        groupBy,
        sortBy,
        sortDirection,
      }),
    [contextByTicketId, groupBy, sortBy, sortDirection, tickets],
  );
  const tableMinWidth = getProjectBacklogTableMinWidth(visibleColumns);
  const columnCount = visibleColumns.length + 2;
  const { collapsedGroupIds, toggleGroup } = useProjectBacklogTableGroupState({
    groupIds: groups.map((group) => group.id),
    groupBy,
    collapseGroupsRequestKey,
    expandGroupsRequestKey,
  });
  const virtualRows = useMemo(
    () =>
      buildProjectBacklogTableVirtualRows({
        groups,
        collapsedGroupIds,
        collapsedTicketIds,
        contextByTicketId,
      }),
    [collapsedGroupIds, collapsedTicketIds, contextByTicketId, groups],
  );

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateProjectBacklogTableVirtualRowSize(virtualRows[index]!),
    overscan: PROJECT_BACKLOG_TABLE_VIRTUAL_OVERSCAN,
    getItemKey: (index) => virtualRows[index]!.key,
  });

  const toggleTicket = useCallback((ticketId: string) => {
    setCollapsedTicketIds((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) {
        next.delete(ticketId);
      } else {
        next.add(ticketId);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-none border-0 border-t border-border/70 bg-background/95 shadow-none scrollbar-gutter-stable"
      >
        <table
          className="w-full table-fixed text-left text-[11px]"
          style={{ minWidth: `${tableMinWidth}px` }}
        >
          <ProjectBacklogTableColGroup visibleColumns={visibleColumns} />
          <ProjectBacklogTableHeader
            visibleColumns={visibleColumns}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortByChange={onSortByChange}
            onSortDirectionChange={onSortDirectionChange}
            {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
          />
          <ProjectBacklogTableVirtualBody
            columnCount={columnCount}
            tableMinWidth={tableMinWidth}
            visibleColumns={visibleColumns}
            virtualRows={virtualRows}
            rowVirtualizer={rowVirtualizer}
            collapsedGroupIds={collapsedGroupIds}
            collapsedTicketIds={collapsedTicketIds}
            projectId={projectId}
            contextByTicketId={contextByTicketId}
            canCreateSubtasks={canCreateSubtasks}
            onTicketContextMenu={onTicketContextMenu}
            getTicketAgentContext={getTicketAgentContext}
            onToggleGroup={toggleGroup}
            onToggleTicket={toggleTicket}
            onOpenTicket={onOpenTicket}
            onSearchAssignableUsers={onSearchAssignableUsers}
            {...(onListChildIssueTypes ? { onListChildIssueTypes } : {})}
            onUpdateAssignee={onUpdateAssignee}
            onUpdateEstimate={onUpdateEstimate}
            onCreateSubtask={onCreateSubtask}
            {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
          />
        </table>
      </div>
    </div>
  );
});
