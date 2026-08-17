/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import type { MouseEvent } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import type { AgentContextCapabilities } from "~/t3team/t3team-agentContext";
import { useT3TeamAgentContextDrag } from "~/t3team/t3team-agentContextDrag";
import type { ProjectBacklogTableRow } from "~/t3team/t3team-projectBacklogTable";

export function ProjectBacklogTableRowIssueCell({
  row,
  projectId,
  ticketCollapsed,
  canToggleChildren,
  capabilities,
  onContextMenu,
  onToggleTicket,
  onOpenTicket,
}: {
  row: ProjectBacklogTableRow;
  projectId: string;
  ticketCollapsed: boolean;
  canToggleChildren: boolean;
  capabilities?: AgentContextCapabilities | null;
  onContextMenu?: ((event: MouseEvent) => void) | undefined;
  onToggleTicket: (ticketId: string) => void;
  onOpenTicket: (projectId: string, ticketId: string) => void;
}) {
  const ticket = row.ticket;
  const issueType = ticket.issueType ?? ticket.ref.type ?? "Issue";
  const issueTypeIconUrl = ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl;
  const dragProps = useT3TeamAgentContextDrag({
    capabilities: capabilities ?? null,
    label: `${ticket.ref.displayId} ${ticket.ref.title}`,
  });

  return (
    <td className="px-3 py-1.5 align-middle" onContextMenu={onContextMenu}>
      <div
        className="flex min-h-7 items-center gap-2"
        style={{ paddingLeft: `${row.depth * 0.85}rem` }}
        draggable={dragProps.draggable}
        onDragStart={dragProps.onDragStart}
        onDragEnd={dragProps.onDragEnd}
      >
        {canToggleChildren ? (
          <button
            type="button"
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-expanded={!ticketCollapsed}
            aria-label={`${ticketCollapsed ? "Expand" : "Collapse"} ${ticket.ref.displayId} subtasks`}
            onClick={() => onToggleTicket(ticket.id)}
            title={ticketCollapsed ? "Show subtasks" : "Hide subtasks"}
          >
            {ticketCollapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="block size-4 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          className="min-w-0 flex-1 text-left hover:text-primary"
          onClick={() => onOpenTicket(projectId, ticket.id)}
          title={ticket.ref.title}
        >
          <div className="flex min-w-0 items-center gap-2 leading-none">
            <JiraIssueTypeIcon
              issueType={issueType}
              issueTypeIconUrl={issueTypeIconUrl}
              className="size-4"
            />
            <span
              className={
                row.isContextOnly
                  ? "shrink-0 font-mono text-[11px] leading-none text-foreground/70"
                  : "shrink-0 font-mono text-[11px] leading-none text-foreground/85"
              }
            >
              {ticket.ref.displayId}
            </span>
            <span
              className={
                row.isContextOnly
                  ? "truncate font-medium leading-4.5 text-foreground/80"
                  : "truncate font-medium leading-4.5 text-foreground"
              }
            >
              {ticket.ref.title}
            </span>
          </div>
        </button>
      </div>
    </td>
  );
}
