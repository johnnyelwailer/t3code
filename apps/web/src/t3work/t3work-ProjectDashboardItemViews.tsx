import type { ReactNode } from "react";
import type { ProjectTicket } from "~/t3work/t3work-types";
import { JiraIssueTypeIcon } from "~/t3work/components/ticket/t3work-JiraIssueType";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import { ProjectDashboardTicketTooltip } from "~/t3work/t3work-ProjectDashboardItemViewParts";
import {
  TicketWorkItemCardMeta,
  TicketWorkItemRowMeta,
} from "~/t3work/t3work-ProjectDashboardItemMeta";

export function TicketWorkItemCard({
  ticket,
  onOpen,
  compact,
  flat,
  groupParent,
  inlineParent,
  inlineChild,
  child,
  childCount,
  lastCheckedAt,
  githubActivityItems,
  showGitHubActivityTitleBadge,
  extraChildren,
  onContextMenu,
}: {
  ticket: ProjectTicket;
  onOpen: () => void;
  compact?: boolean;
  flat?: boolean;
  groupParent?: boolean;
  inlineParent?: boolean;
  inlineChild?: boolean;
  child?: boolean;
  childCount?: number;
  lastCheckedAt?: number;
  githubActivityItems?: ReadonlyArray<GitHubWorkActivityItem>;
  showGitHubActivityTitleBadge?: boolean;
  extraChildren?: ReactNode;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const showsChildRelationship = child || inlineChild;
  const cardContent = (
    <div
      className={`h-full overflow-hidden rounded-md border shadow-sm transition-all hover:-translate-y-px hover:bg-accent/35 hover:shadow-md @container/ticket-card ${
        child
          ? "border-0 bg-transparent shadow-none hover:translate-x-px hover:bg-accent/18 hover:shadow-none"
          : groupParent
            ? "border-0 bg-transparent shadow-none hover:translate-y-0 hover:bg-accent/18 hover:shadow-none"
            : inlineChild
              ? "border-0 bg-transparent shadow-none hover:translate-x-px hover:bg-accent/10 hover:shadow-none"
              : inlineParent
                ? "border-border bg-background/78 shadow-none"
                : flat
                  ? "border-border bg-background/68"
                  : "border-border/95 bg-card/78"
      }`}
    >
      <div
        className={`flex h-full flex-col ${
          compact ? "gap-0.5 p-1.5 @md/ticket-card:gap-1 @md/ticket-card:p-2" : "gap-3 p-3.5"
        }`}
      >
        <div className="flex min-w-0 items-start gap-2">
          <JiraIssueTypeIcon
            issueType={ticket.issueType}
            issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
            className={compact ? "mt-0.5" : "mt-px"}
          />
          <div className="min-w-0 flex-1">
            <TicketWorkItemCardMeta
              ticket={ticket}
              compact={compact}
              child={child}
              inlineChild={inlineChild}
              childCount={childCount}
              githubActivityItems={githubActivityItems}
              showGitHubActivityTitleBadge={showGitHubActivityTitleBadge}
            />
            <div
              className={`mt-1 overflow-hidden font-medium ${
                compact
                  ? "mt-0.5 line-clamp-2 text-[11px] leading-3.5 break-words @md/ticket-card:text-xs @md/ticket-card:leading-4 @lg/ticket-card:line-clamp-1"
                  : "line-clamp-2 text-sm leading-5 break-words"
              }`}
            >
              {ticket.ref.title}
            </div>
            {ticket.assignee && (
              <div
                className={`truncate text-muted-foreground ${compact ? "mt-0.5 hidden text-[11px] leading-4 @lg/ticket-card:block" : "mt-1 text-xs"}`}
              >
                Assigned to {ticket.assignee}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`block w-full min-w-0 text-left @container/ticket-item ${showsChildRelationship ? (inlineChild ? "relative pl-3" : "relative pl-4") : ""}`}
      onContextMenu={onContextMenu}
    >
      {child ? (
        <span className="absolute top-3.5 left-1 h-px w-2.5 bg-foreground/16" aria-hidden />
      ) : null}
      <ProjectDashboardTicketTooltip
        ticket={ticket}
        {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
        trigger={<button type="button" className="block w-full text-left" onClick={onOpen} />}
      >
        {cardContent}
      </ProjectDashboardTicketTooltip>
      {extraChildren}
    </div>
  );
}

export function TicketWorkItemRow({
  ticket,
  onOpen,
  child,
  childCount,
  lastCheckedAt,
  githubActivityItems,
  extraChildren,
  onContextMenu,
}: {
  ticket: ProjectTicket;
  onOpen: () => void;
  child?: boolean;
  childCount?: number;
  lastCheckedAt?: number;
  githubActivityItems?: ReadonlyArray<GitHubWorkActivityItem>;
  extraChildren?: ReactNode;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  return (
    <div className="w-full" onContextMenu={onContextMenu}>
      <ProjectDashboardTicketTooltip
        ticket={ticket}
        {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
        trigger={
          <button
            type="button"
            className={`flex w-full items-start gap-2 rounded-md border border-transparent px-1 py-1 text-left transition-colors hover:border-border/50 hover:bg-accent/25 ${child ? "relative pl-3" : ""}`}
            onClick={onOpen}
          />
        }
      >
        {child && <span className="absolute top-2 left-0 h-px w-2 bg-border/70" aria-hidden />}
        <JiraIssueTypeIcon
          issueType={ticket.issueType}
          issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
        />
        <div className="min-w-0 flex-1">
          <TicketWorkItemRowMeta
            ticket={ticket}
            child={child}
            childCount={childCount}
            githubActivityItems={githubActivityItems}
          />
          <div className="mt-0.5 text-sm font-medium leading-5">{ticket.ref.title}</div>
          {ticket.assignee && (
            <div className="text-xs text-muted-foreground">Assigned to {ticket.assignee}</div>
          )}
        </div>
      </ProjectDashboardTicketTooltip>
      {extraChildren}
    </div>
  );
}
