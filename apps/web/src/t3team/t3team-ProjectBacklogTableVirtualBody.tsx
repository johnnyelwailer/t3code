import type { Virtualizer } from "@tanstack/react-virtual";
import { memo } from "react";
import type { MouseEvent } from "react";

import type { AtlassianAssignableUser } from "~/t3team/backend/t3team-types";
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
  rowVirtualizer,
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
  onUpdateAssignee,
  onUpdateEstimate,
  onCreateSubtask,
}: {
  columnCount: number;
  tableMinWidth: number;
  visibleColumns: readonly ProjectBacklogTableColumnId[];
  virtualRows: readonly ProjectBacklogTableVirtualRow[];
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
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
          <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const virtualRow = virtualRows[virtualItem.index]!;

              return (
                <ProjectBacklogTableVirtualRowView
                  key={virtualRow.key}
                  virtualRow={virtualRow}
                  dataIndex={virtualItem.index}
                  measureRef={rowVirtualizer.measureElement}
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
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
