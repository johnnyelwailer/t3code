import { memo } from "react";
import type { CSSProperties, MouseEvent } from "react";

import type { AtlassianAssignableUser } from "~/t3work/backend/t3work-types";
import type { AgentContextCapabilities } from "~/t3work/t3work-agentContext";
import { ProjectBacklogTableColGroup } from "~/t3work/t3work-ProjectBacklogTableColGroup";
import { ProjectBacklogTableGroupHeaderRow } from "~/t3work/t3work-ProjectBacklogTableGroupHeaderRow";
import { ProjectBacklogTableRowView } from "~/t3work/t3work-projectBacklogTableRowView";
import type { ProjectBacklogTicketContext } from "~/t3work/t3work-projectBacklogPresentation";
import type { ProjectBacklogTableColumnId } from "~/t3work/t3work-projectBacklogTable";
import type { ProjectBacklogTableVirtualRow as ProjectBacklogTableVirtualRowModel } from "~/t3work/t3work-projectBacklogTableVirtualRows";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3work/t3work-types";

type ProjectBacklogTableVirtualRowViewProps = {
  virtualRow: ProjectBacklogTableVirtualRowModel;
  style: CSSProperties;
  measureRef: (element: Element | null) => void;
  dataIndex: number;
  tableMinWidth: number;
  visibleColumns: readonly ProjectBacklogTableColumnId[];
  columnCount: number;
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
};

export const ProjectBacklogTableVirtualRowView = memo(function ProjectBacklogTableVirtualRowView({
  virtualRow,
  style,
  measureRef,
  dataIndex,
  tableMinWidth,
  visibleColumns,
  columnCount,
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
}: ProjectBacklogTableVirtualRowViewProps) {
  return (
    <div
      ref={measureRef}
      data-index={dataIndex}
      className="absolute left-0 top-0 w-full"
      style={style}
    >
      <table
        className="w-full table-fixed text-left text-[11px]"
        style={{ minWidth: `${tableMinWidth}px` }}
      >
        <ProjectBacklogTableColGroup visibleColumns={visibleColumns} />
        <tbody className="divide-y divide-border/40 align-top">
          {virtualRow.kind === "group-header" ? (
            <ProjectBacklogTableGroupHeaderRow
              group={virtualRow.group}
              collapsed={collapsedGroupIds.has(virtualRow.group.id)}
              columnCount={columnCount}
              onToggleGroup={onToggleGroup}
            />
          ) : (
            (() => {
              const parentTicket = contextByTicketId
                .get(virtualRow.row.ticket.id)
                ?.ancestors.at(-1);

              return (
                <ProjectBacklogTableRowView
                  row={virtualRow.row}
                  projectId={projectId}
                  visibleColumns={visibleColumns}
                  ticketCollapsed={collapsedTicketIds.has(virtualRow.row.ticket.id)}
                  canToggleChildren={virtualRow.expandableTicketIds.has(virtualRow.row.ticket.id)}
                  canCreateSubtasks={canCreateSubtasks}
                  onTicketContextMenu={onTicketContextMenu}
                  getTicketAgentContext={getTicketAgentContext}
                  onToggleTicket={onToggleTicket}
                  onOpenTicket={onOpenTicket}
                  onSearchAssignableUsers={onSearchAssignableUsers}
                  onUpdateAssignee={onUpdateAssignee}
                  onUpdateEstimate={onUpdateEstimate}
                  onCreateSubtask={onCreateSubtask}
                  {...(parentTicket ? { parentTicket } : {})}
                  {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
                />
              );
            })()
          )}
        </tbody>
      </table>
    </div>
  );
});
