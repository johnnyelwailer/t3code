import type { MouseEvent, RefObject } from "react";

import { T3SidebarSubRow } from "~/t3team/components/ui/t3team-sidebar-row";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { TicketCardDetailsTooltip } from "~/t3team/t3team-TicketCardDetailsTooltip";
import type { ProjectTicket } from "~/t3team/t3team-types";

import { ProjectSidebarTicketEntryActions } from "./t3team-ProjectSidebarTicketEntryActions";
import type { SidebarItemState } from "./t3team-projectSidebarItemState";

export function ProjectSidebarTicketCard({
  ticket,
  state,
  jiraLastCheckedAt,
  rowRef,
  onSelectTicket,
  onCreateThread,
  onOpenMenu,
}: {
  ticket: ProjectTicket;
  state: SidebarItemState;
  jiraLastCheckedAt?: number;
  rowRef: RefObject<HTMLAnchorElement | null>;
  onSelectTicket: () => void;
  onCreateThread: (event: MouseEvent) => Promise<void>;
  onOpenMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="group/ticket-card relative overflow-hidden rounded-lg">
      <Tooltip>
        <TooltipTrigger
          render={
            <T3SidebarSubRow
              size="two-line"
              ref={rowRef}
              hoverGroup="ticket-card"
              isActive={state.isSelected}
              className="-translate-x-px cursor-grab active:cursor-grabbing"
              onClick={onSelectTicket}
            />
          }
        >
          <div className="flex w-full items-center gap-1">
            <JiraIssueTypeIcon
              issueType={ticket.issueType}
              issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
            />
            <span className="truncate text-2xs font-medium">{ticket.ref.displayId}</span>
            <span className="ml-1 text-3xs text-muted-foreground/75">{ticket.status}</span>
          </div>
          <div className="w-full truncate text-3xs leading-tight text-muted-foreground/70">
            {ticket.ref.title}
          </div>
        </TooltipTrigger>
        <TooltipPopup side="top" align="start" className="max-w-84">
          <TicketCardDetailsTooltip
            ticket={ticket}
            {...(jiraLastCheckedAt !== undefined ? { lastCheckedAt: jiraLastCheckedAt } : {})}
          />
        </TooltipPopup>
      </Tooltip>
      <ProjectSidebarTicketEntryActions
        displayId={ticket.ref.displayId}
        onCreateThread={onCreateThread}
        onOpenMenu={onOpenMenu}
      />
    </div>
  );
}
