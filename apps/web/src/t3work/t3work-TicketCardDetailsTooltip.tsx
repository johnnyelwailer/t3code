import type { ProjectTicket } from "~/t3work/t3work-types";
import { formatLastCheckedAt } from "~/t3work/t3work-integrationFreshness";

function formatAbsoluteTime(updatedAt: string | undefined): string | undefined {
  if (!updatedAt) return undefined;
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return updatedAt;
  return new Date(timestamp).toLocaleString();
}

export function TicketCardDetailsTooltip({
  ticket,
  lastCheckedAt,
}: {
  ticket: ProjectTicket;
  lastCheckedAt?: number;
}) {
  const updatedAt = formatAbsoluteTime(ticket.updatedAt);
  const lastChecked = formatLastCheckedAt(lastCheckedAt);

  return (
    <div className="max-w-80 space-y-2 whitespace-normal">
      <div className="text-[11px] font-semibold text-foreground">{ticket.ref.displayId}</div>
      <div className="text-xs leading-4 text-foreground">{ticket.ref.title}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>Status</span>
        <span className="truncate">{ticket.status}</span>
        {ticket.priority ? (
          <>
            <span>Priority</span>
            <span className="truncate">{ticket.priority}</span>
          </>
        ) : null}
        {ticket.assignee ? (
          <>
            <span>Assignee</span>
            <span className="truncate">{ticket.assignee}</span>
          </>
        ) : null}
        {updatedAt ? (
          <>
            <span>Updated</span>
            <span className="truncate">{updatedAt}</span>
          </>
        ) : null}
        {lastChecked ? (
          <>
            <span>Last checked</span>
            <span className="truncate">{lastChecked}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
