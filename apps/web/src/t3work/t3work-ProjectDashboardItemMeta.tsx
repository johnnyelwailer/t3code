import { GitHubActivityTitleBadge } from "~/t3work/t3work-GitHubActivityTitleBadge";
import { renderRelativeUpdatedAt } from "~/t3work/t3work-githubActivityViewUtils";
import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { ProjectTicket } from "~/t3work/t3work-types";

import { ProjectDashboardTicketRelationshipBadge } from "./t3work-ProjectDashboardItemViewParts";

export function TicketWorkItemCardMeta({
  ticket,
  compact,
  child,
  inlineChild,
  childCount,
  githubActivityItems,
  showGitHubActivityTitleBadge,
}: {
  ticket: ProjectTicket;
  compact: boolean | undefined;
  child: boolean | undefined;
  inlineChild: boolean | undefined;
  childCount: number | undefined;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem> | undefined;
  showGitHubActivityTitleBadge: boolean | undefined;
}) {
  const updatedLabel = compact ? renderRelativeUpdatedAt(ticket.updatedAt) : undefined;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={`truncate font-medium text-muted-foreground ${
          compact ? "text-[11px] @md/ticket-card:text-xs" : "text-xs"
        }`}
      >
        {ticket.ref.displayId}
      </span>
      <ProjectDashboardTicketRelationshipBadge
        child={child || inlineChild}
        childCount={childCount}
      />
      <span
        className={`max-w-28 truncate text-[10px] text-muted-foreground/75 ${
          compact ? "hidden @md/ticket-card:inline" : ""
        }`}
      >
        {ticket.status}
      </span>
      {ticket.priority && (
        <span
          className={`max-w-24 truncate rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground ${
            compact ? "hidden @lg/ticket-card:inline" : ""
          }`}
        >
          {ticket.priority}
        </span>
      )}
      {showGitHubActivityTitleBadge !== false &&
      githubActivityItems &&
      githubActivityItems.length > 0 ? (
        <GitHubActivityTitleBadge
          items={githubActivityItems}
          {...(compact ? { compact: true } : {})}
        />
      ) : null}
      {updatedLabel ? (
        <span className="ml-auto hidden shrink-0 text-[10px] text-muted-foreground @lg/ticket-card:inline-flex">
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
  githubActivityItems,
}: {
  ticket: ProjectTicket;
  child: boolean | undefined;
  childCount: number | undefined;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem> | undefined;
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
      {githubActivityItems && githubActivityItems.length > 0 ? (
        <GitHubActivityTitleBadge items={githubActivityItems} compact />
      ) : null}
    </div>
  );
}
