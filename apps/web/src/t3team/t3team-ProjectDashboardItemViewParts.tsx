import { CornerDownRight, GitBranch } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { Tooltip, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { TicketTooltipPopup } from "~/t3team/t3team-TicketTooltipPopup";
import type { ProjectTicket } from "~/t3team/t3team-types";

export function ProjectDashboardTicketRelationshipBadge({
  child,
  childCount,
}: {
  child: boolean | undefined;
  childCount: number | undefined;
}) {
  if (child) {
    return (
      <span className="inline-flex items-center text-muted-foreground/75" aria-label="Child item">
        <CornerDownRight className="size-3" />
      </span>
    );
  }

  if (!childCount) {
    return null;
  }

  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
      aria-label={`${childCount} child items`}
    >
      <GitBranch className="size-3" />
      <span className="tabular-nums">{childCount}</span>
    </span>
  );
}

export function ProjectDashboardTicketTooltip({
  ticket,
  lastCheckedAt,
  trigger,
  children,
}: {
  ticket: ProjectTicket;
  lastCheckedAt?: number;
  trigger: ReactElement;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>{children}</TooltipTrigger>
      <TicketTooltipPopup
        ticket={ticket}
        {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
      />
    </Tooltip>
  );
}
