import { memo } from "react";
import type { MouseEvent } from "react";

import type { AtlassianAssignableUser, AtlassianChildIssueType } from "~/t3team/backend/t3team-types";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { ProjectBacklogTableRowActionCell } from "~/t3team/t3team-ProjectBacklogTableRowActionCell";
import { ProjectBacklogTableRowDataCell } from "~/t3team/t3team-ProjectBacklogTableRowDataCell";
import { ProjectBacklogTableRowIssueCell } from "~/t3team/t3team-ProjectBacklogTableRowIssueCell";
import {
  areProjectBacklogTableRowsEqual,
  type ProjectBacklogTableColumnId,
  type ProjectBacklogTableRow,
} from "~/t3team/t3team-projectBacklogTable";
import type { ProjectBacklogSubtaskCreateInput, ProjectTicket } from "~/t3team/t3team-types";
import { useProjectBacklogTableRowDraft } from "~/t3team/t3team-useProjectBacklogTableRowDraft";

type ProjectBacklogTableRowViewProps = {
  row: ProjectBacklogTableRow;
  projectId: string;
  parentTicket?: ProjectTicket;
  visibleColumns: readonly ProjectBacklogTableColumnId[];
  ticketCollapsed: boolean;
  canToggleChildren: boolean;
  estimateFieldLabel?: string;
  canCreateSubtasks: boolean;
  onTicketContextMenu: (event: MouseEvent, ticket: ProjectTicket) => void;
  getTicketAgentContext: (ticket: ProjectTicket) => AgentContextCapabilities | null;
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
};

export const ProjectBacklogTableRowView = memo(function ProjectBacklogTableRowView({
  row,
  projectId,
  parentTicket,
  visibleColumns,
  ticketCollapsed,
  canToggleChildren,
  estimateFieldLabel,
  canCreateSubtasks,
  onTicketContextMenu,
  getTicketAgentContext,
  onToggleTicket,
  onOpenTicket,
  onSearchAssignableUsers,
  onListChildIssueTypes,
  onUpdateAssignee,
  onUpdateEstimate,
  onCreateSubtask,
}: ProjectBacklogTableRowViewProps) {
  const ticket = row.ticket;
  const {
    estimateDraft,
    rowDirty,
    rowError,
    rowSaving,
    setEstimateDraft,
    resetEstimateDraft,
    commitRow,
  } = useProjectBacklogTableRowDraft({
    ticket,
    onUpdateEstimate,
  });
  const handleCommitRow = () => {
    void commitRow();
  };

  return (
    <tr
      className={
        row.isContextOnly
          ? "group bg-muted/10 text-muted-foreground hover:bg-muted/18"
          : "group hover:bg-muted/18"
      }
    >
      <ProjectBacklogTableRowIssueCell
        row={row}
        projectId={projectId}
        ticketCollapsed={ticketCollapsed}
        canToggleChildren={canToggleChildren}
        capabilities={getTicketAgentContext(ticket)}
        onContextMenu={(event) => onTicketContextMenu(event, ticket)}
        onToggleTicket={onToggleTicket}
        onOpenTicket={onOpenTicket}
      />
      {visibleColumns.map((columnId) => (
        <ProjectBacklogTableRowDataCell
          key={`${ticket.id}:${columnId}`}
          columnId={columnId}
          ticket={ticket}
          estimateDraft={estimateDraft}
          onEstimateDraftChange={setEstimateDraft}
          onEstimateReset={resetEstimateDraft}
          onCommitRow={handleCommitRow}
          onSearchAssignableUsers={onSearchAssignableUsers}
          onUpdateAssignee={onUpdateAssignee}
          onUpdateEstimate={onUpdateEstimate}
          {...(parentTicket ? { parentTicket } : {})}
          {...(estimateFieldLabel ? { estimateFieldLabel } : {})}
        />
      ))}
      <ProjectBacklogTableRowActionCell
        contextOnly={row.isContextOnly}
        rowDirty={rowDirty}
        rowError={rowError}
        rowSaving={rowSaving}
        ticket={ticket}
        canCreateSubtasks={canCreateSubtasks}
        onCreateSubtask={onCreateSubtask}
        onSearchAssignableUsers={onSearchAssignableUsers}
        {...(onListChildIssueTypes ? { onListChildIssueTypes } : {})}
        onCommitRow={handleCommitRow}
      />
    </tr>
  );
}, areProjectBacklogTableRowViewPropsEqual);

function areProjectBacklogTableRowViewPropsEqual(
  previous: ProjectBacklogTableRowViewProps,
  next: ProjectBacklogTableRowViewProps,
): boolean {
  return (
    previous.projectId === next.projectId &&
    previous.parentTicket === next.parentTicket &&
    previous.visibleColumns.length === next.visibleColumns.length &&
    previous.visibleColumns.every((column, index) => column === next.visibleColumns[index]) &&
    previous.ticketCollapsed === next.ticketCollapsed &&
    previous.canToggleChildren === next.canToggleChildren &&
    previous.estimateFieldLabel === next.estimateFieldLabel &&
    previous.canCreateSubtasks === next.canCreateSubtasks &&
    previous.onTicketContextMenu === next.onTicketContextMenu &&
    previous.getTicketAgentContext === next.getTicketAgentContext &&
    previous.onToggleTicket === next.onToggleTicket &&
    previous.onOpenTicket === next.onOpenTicket &&
    previous.onSearchAssignableUsers === next.onSearchAssignableUsers &&
    previous.onListChildIssueTypes === next.onListChildIssueTypes &&
    previous.onUpdateAssignee === next.onUpdateAssignee &&
    previous.onUpdateEstimate === next.onUpdateEstimate &&
    previous.onCreateSubtask === next.onCreateSubtask &&
    areProjectBacklogTableRowsEqual(previous.row, next.row)
  );
}
