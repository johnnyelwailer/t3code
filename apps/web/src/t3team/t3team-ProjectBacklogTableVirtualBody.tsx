import type { VirtualItem } from "@tanstack/react-virtual";
import { memo } from "react";
import type { MouseEvent } from "react";

import type {
  AtlassianAssignableUser,
  AtlassianChildIssueType,
} from "~/t3team/backend/t3team-types";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { ProjectBacklogTableVirtualRowView } from "~/t3team/t3team-ProjectBacklogTableVirtualRow";
import type { ProjectBacklogTicketContext } from "~/t3team/t3team-projectBacklogPresentation";
import type { ProjectBacklogTableColumnId } from "~/t3team/t3team-projectBacklogTable";
import type { ProjectBacklogTableVirtualRow } from "~/t3team/t3team-projectBacklogTableVirtualRows";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3team/t3team-types";

export const ProjectBacklogTableVirtualBody = memo(function ProjectBacklogTableVirtualBody({
  columnCount,
  tableMinWidth,
  visibleColumns,
  virtualRows,
  virtualItems,
  totalSize,
  measureElement,
  collapsedGroupIds,
  collapsedTicketIds,
  projectId,
  contextByTicketId,
  estimateFieldLabel,
  canCreateSubtasks,
  onTicketContextMenu,
  getTicketAgentContext,
  onToggleGroup,
  onToggleTicket,
  onOpenTicket,
  onSearchAssignableUsers,
  onListChildIssueTypes,
  onUpdateAssignee,
  onUpdateEstimate,
  onCreateSubtask,
}: {
  columnCount: number;
  tableMinWidth: number;
  visibleColumns: readonly ProjectBacklogTableColumnId[];
  virtualRows: readonly ProjectBacklogTableVirtualRow[];
  // The visible window is passed as values, not read off the virtualizer
  // instance: the instance is referentially stable, so a memoized body that
  // only received it would bail out on every scroll and never paint new rows.
  virtualItems: readonly VirtualItem[];
  totalSize: number;
  measureElement: (element: Element | null) => void;
  collapsedGroupIds: ReadonlySet<string>;
  collapsedTicketIds: ReadonlySet<string>;
  projectId: string;
  contextByTicketId: ReadonlyMap<string, ProjectBacklogTicketContext>;
  estimateFieldLabel?: string;
  canCreateSubtasks: boolean;
  onTicketContextMenu: (event: MouseEvent, ticket: ProjectTicket) => void;
  getTicketAgentContext: (ticket: ProjectTicket) => AgentContextCapabilities | null;
  onToggleGroup: (groupId: string) => void;
  onToggleTicket: (ticketId: string) => void;
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
}) {
  return (
    <tbody>
      <tr>
        <td colSpan={columnCount} className="border-0 p-0">
          <div className="relative w-full" style={{ height: `${totalSize}px` }}>
            {virtualItems.map((virtualItem) => {
              const virtualRow = virtualRows[virtualItem.index]!;

              return (
                <ProjectBacklogTableVirtualRowView
                  key={virtualRow.key}
                  virtualRow={virtualRow}
                  dataIndex={virtualItem.index}
                  measureRef={measureElement}
                  start={virtualItem.start}
                  size={virtualItem.size}
                  tableMinWidth={tableMinWidth}
                  visibleColumns={visibleColumns}
                  columnCount={columnCount}
                  collapsedGroupIds={collapsedGroupIds}
                  collapsedTicketIds={collapsedTicketIds}
                  projectId={projectId}
                  contextByTicketId={contextByTicketId}
                  canCreateSubtasks={canCreateSubtasks}
                  onTicketContextMenu={onTicketContextMenu}
                  getTicketAgentContext={getTicketAgentContext}
                  onToggleGroup={onToggleGroup}
                  onToggleTicket={onToggleTicket}
                  onOpenTicket={onOpenTicket}
                  onSearchAssignableUsers={onSearchAssignableUsers}
                  {...(onListChildIssueTypes ? { onListChildIssueTypes } : {})}
                  onUpdateAssignee={onUpdateAssignee}
                  onUpdateEstimate={onUpdateEstimate}
                  onCreateSubtask={onCreateSubtask}
                  {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
                />
              );
            })}
          </div>
        </td>
      </tr>
    </tbody>
  );
});
