import type { ProjectTicket } from "~/t3work/t3work-types";
import { TooltipPopup } from "~/t3work/components/ui/t3work-tooltip";
import { TicketCardDetailsTooltip } from "~/t3work/t3work-TicketCardDetailsTooltip";

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
