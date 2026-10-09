import { renderRelativeUpdatedAt } from "~/t3team/t3team-githubActivityViewUtils";
import type { ProjectTicket } from "~/t3team/t3team-types";

import { ProjectDashboardTicketRelationshipBadge } from "./t3team-ProjectDashboardItemViewParts";

export function TicketWorkItemCardMeta({
  ticket,
  compact,
  child,
  inlineChild,
  childCount,
  showTicketKey = true,
  showStatusChip = true,
  showPriorityChip = true,
  showUpdatedAt = true,
  keyOpacity = 1,
  statusOpacity = 1,
  priorityOpacity = 1,
  updatedOpacity = 1,
}: {
  ticket: ProjectTicket;
  compact: boolean | undefined;
  child: boolean | undefined;
  inlineChild: boolean | undefined;
  childCount: number | undefined;
  showTicketKey?: boolean;
  showStatusChip?: boolean;
  showPriorityChip?: boolean;
  showUpdatedAt?: boolean;
  keyOpacity?: number;
  statusOpacity?: number;
  priorityOpacity?: number;
  updatedOpacity?: number;
}) {
  const updatedLabel =
    showUpdatedAt && compact && updatedOpacity > 0.02
      ? renderRelativeUpdatedAt(ticket.updatedAt)
      : undefined;
  const showKey = showTicketKey && keyOpacity > 0.02;
  const showStatus = showStatusChip && statusOpacity > 0.02;
  const showPriority = Boolean(ticket.priority) && showPriorityChip && priorityOpacity > 0.02;
  if (!showKey && !showStatus && !showPriority && !updatedLabel) {
    return null;
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      {showKey ? (
        <span
          className={`min-w-0 shrink truncate font-medium text-muted-foreground ${
            compact ? "text-[11px] @md/ticket-card:text-xs" : "text-xs"
          }`}
          style={{ opacity: keyOpacity }}
        >
          {ticket.ref.displayId}
        </span>
      ) : null}
      <ProjectDashboardTicketRelationshipBadge
        child={child || inlineChild}
        childCount={childCount}
      />
      {showStatus ? (
        <span
          className={`max-w-28 shrink truncate text-[10px] text-muted-foreground/75 ${
            compact ? "hidden @md/ticket-card:inline" : ""
          }`}
          style={{ opacity: statusOpacity }}
        >
          {ticket.status}
        </span>
      ) : null}
      {showPriority ? (
        <span
          className={`max-w-24 shrink truncate rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground ${
            compact ? "hidden @lg/ticket-card:inline" : ""
          }`}
          style={{ opacity: priorityOpacity }}
        >
          {ticket.priority}
        </span>
      ) : null}
      {updatedLabel ? (
        // In-flow + truncate (no shrink-0). Card padding owns the edge inset — do not
        // flush this against the border.
        <span
          className="ml-auto min-w-0 max-w-[40%] shrink truncate pl-2 text-right text-[10px] leading-4 text-muted-foreground"
          style={{ opacity: updatedOpacity }}
          title={`Updated ${updatedLabel}`}
        >
          Updated {updatedLabel}
        </span>
      ) : null}
    </div>
  );
}

export function TicketWorkItemRowMeta({
  ticket,
  child,
  childCount,
}: {
  ticket: ProjectTicket;
  child: boolean | undefined;
  childCount: number | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{ticket.ref.displayId}</span>
      <ProjectDashboardTicketRelationshipBadge child={child} childCount={childCount} />
      <span className="text-[10px] text-muted-foreground/75">{ticket.status}</span>
      {ticket.priority && (
        <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {ticket.priority}
        </span>
      )}
    </div>
  );
}
