import { CornerDownRight, GitBranch } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectTicket } from "~/t3work/t3work-types";
import { JiraIssueTypeIcon } from "~/t3work/components/ticket/t3work-JiraIssueType";
import { Tooltip, TooltipTrigger } from "~/t3work/components/ui/t3work-tooltip";
import { TicketTooltipPopup } from "~/t3work/t3work-TicketTooltipPopup";

export function TicketWorkItemCard({
  ticket,
  onOpen,
  compact,
  flat,
  child,
  childCount,
  lastCheckedAt,
  extraChildren,
  onContextMenu,
}: {
  ticket: ProjectTicket;
  onOpen: () => void;
  compact?: boolean;
  flat?: boolean;
  child?: boolean;
  childCount?: number;
  lastCheckedAt?: number;
  extraChildren?: ReactNode;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const cardContent = (
    <div
      className={`h-full overflow-hidden rounded-md border shadow-sm transition-all hover:-translate-y-px hover:bg-accent/35 hover:shadow-md @container/ticket-card ${
        child
          ? "border-dashed border-border/70 bg-muted/30"
          : flat
            ? "border-border/70 bg-background/55"
            : "border-border/80 bg-card/75"
      }`}
    >
      <div className={`flex h-full flex-col ${compact ? "gap-2 p-2.5" : "gap-3 p-3.5"}`}>
        <div className="flex min-w-0 items-start gap-2">
          <JiraIssueTypeIcon
            issueType={ticket.issueType}
            issueTypeIconUrl={ticket.issueTypeIconUrl ?? ticket.ref.issueTypeIconUrl}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-medium text-muted-foreground">
                {ticket.ref.displayId}
              </span>
              {child ? (
                <span
                  className="inline-flex items-center text-muted-foreground/75"
                  aria-label="Child item"
                >
                  <CornerDownRight className="size-3" />
                </span>
              ) : childCount ? (
                <span
                  className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  aria-label={`${childCount} child items`}
                >
                  <GitBranch className="size-3" />
                  <span className="tabular-nums">{childCount}</span>
                </span>
              ) : null}
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
            </div>
            <div
              className={`mt-1 overflow-hidden font-medium ${
                compact
                  ? "line-clamp-2 text-xs leading-4 break-words @lg/ticket-card:line-clamp-1"
                  : "line-clamp-2 text-sm leading-5 break-words"
              }`}
            >
              {ticket.ref.title}
            </div>
          </div>
        </div>

        {ticket.assignee && (
          <div
            className={`mt-auto truncate text-xs text-muted-foreground ${compact ? "hidden @lg/ticket-card:block" : ""}`}
          >
            Assigned to {ticket.assignee}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`block w-full text-left ${child ? "relative pl-3" : ""}`}
      onContextMenu={onContextMenu}
    >
      {child && <span className="absolute top-2 left-0 h-px w-2 bg-border/70" aria-hidden />}
      <Tooltip>
        <TooltipTrigger
          render={<button type="button" className="block w-full text-left" onClick={onOpen} />}
        >
          {cardContent}
        </TooltipTrigger>
        <TicketTooltipPopup
          ticket={ticket}
          {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
        />
      </Tooltip>
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
  extraChildren,
  onContextMenu,
}: {
  ticket: ProjectTicket;
  onOpen: () => void;
  child?: boolean;
  childCount?: number;
  lastCheckedAt?: number;
  extraChildren?: ReactNode;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  return (
    <div className="w-full" onContextMenu={onContextMenu}>
      <Tooltip>
        <TooltipTrigger
          render={
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
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {ticket.ref.displayId}
              </span>
              {child ? (
                <span
                  className="inline-flex items-center text-muted-foreground/75"
                  aria-label="Child item"
                >
                  <CornerDownRight className="size-3" />
                </span>
              ) : childCount ? (
                <span
                  className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  aria-label={`${childCount} child items`}
                >
                  <GitBranch className="size-3" />
                  <span className="tabular-nums">{childCount}</span>
                </span>
              ) : null}
              <span className="text-[10px] text-muted-foreground/75">{ticket.status}</span>
              {ticket.priority && (
                <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {ticket.priority}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-sm font-medium leading-5">{ticket.ref.title}</div>
            {ticket.assignee && (
              <div className="text-xs text-muted-foreground">Assigned to {ticket.assignee}</div>
            )}
          </div>
        </TooltipTrigger>
        <TicketTooltipPopup
          ticket={ticket}
          {...(lastCheckedAt !== undefined ? { lastCheckedAt } : {})}
        />
      </Tooltip>
      {extraChildren}
    </div>
  );
}
