import type { MouseEvent, RefObject } from "react";

import { SidebarMenuSubButton } from "~/t3team/components/ui/t3team-sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { TicketCardDetailsTooltip } from "~/t3team/t3team-TicketCardDetailsTooltip";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { GitHubActivityTitleBadge } from "~/t3team/t3team-GitHubActivityTitleBadge";
import type { ProjectTicket } from "~/t3team/t3team-types";

import { ProjectSidebarTicketEntryActions } from "./t3team-ProjectSidebarTicketEntryActions";
import {
  getSidebarWrappedButtonClassName,
  type SidebarItemState,
} from "./t3team-projectSidebarItemState";

export function ProjectSidebarTicketCard({
  ticket,
  state,
  jiraLastCheckedAt,
  githubActivityItems,
  rowRef,
  onSelectTicket,
  onCreateThread,
  onOpenMenu,
}: {
  ticket: ProjectTicket;
  state: SidebarItemState;
  jiraLastCheckedAt?: number;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
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
            <SidebarMenuSubButton
              size="sm"
              ref={rowRef}
              isActive={state.isSelected}
              className={`h-auto min-h-8 w-full cursor-grab flex-col items-start py-1 group-hover/ticket-card:bg-accent group-hover/ticket-card:text-foreground group-focus-within/ticket-card:bg-accent group-focus-within/ticket-card:text-foreground active:cursor-grabbing ${getSidebarWrappedButtonClassName(
                state,
              )}`}
              onClick={onSelectTicket}
            />
          }
        >
          <div className="flex w-full items-center gap-1">
            <JiraIssueTypeIcon
              issueType={ticket.issueType}
              issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
            />
            <span className="truncate text-[11px] font-medium">{ticket.ref.displayId}</span>
            <span className="ml-1 text-[10px] text-muted-foreground/75">{ticket.status}</span>
            {githubActivityItems.length > 0 ? (
              <GitHubActivityTitleBadge items={githubActivityItems} compact />
            ) : null}
          </div>
          <div className="w-full truncate text-[10px] leading-tight text-muted-foreground/70">
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
