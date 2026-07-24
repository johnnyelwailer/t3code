import type { ProjectTicket } from "~/t3team/t3team-types";
import { TooltipPopup } from "~/t3team/components/ui/t3team-tooltip";
import { TicketCardDetailsTooltip } from "~/t3team/t3team-TicketCardDetailsTooltip";

export function TicketTooltipPopup({
  ticket,
  lastCheckedAt,
}: {
  ticket: ProjectTicket;
  lastCheckedAt?: number;
}) {
  return (
    <TooltipPopup side="top" align="start" className="max-w-84">
      <TicketCardDetailsTooltip
        ticket={ticket}
        {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
      />
    </TooltipPopup>
  );
}
