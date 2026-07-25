import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { cn } from "~/t3team/lib/t3team-utils";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";
import { WorkItemStatusBadge } from "~/t3team/workitem/t3team-WorkItemStatusBadge";

/**
 * One related issue: a child, a link target, a subtask.
 *
 * Children and linked issues are the same row on purpose — they differ in what groups them, not in
 * what a reader needs from each line. The summary takes the remaining width and truncates, because
 * a wrapping summary makes a list of ten rows impossible to scan; the full text is on hover.
 */
export function WorkItemIssueRow({
  ticket,
  relationLabel,
  onOpen,
  className,
}: {
  readonly ticket: ProjectTicket;
  /** Link semantics, e.g. "blocks" or "relates to". Absent for plain children. */
  readonly relationLabel?: string | undefined;
  readonly onOpen?: ((ticketId: string) => void) | undefined;
  readonly className?: string;
}) {
  const summary = ticket.ref.title;
  const isPlaceholder = summary === ticket.ref.displayId;

  const content = (
    <>
      {relationLabel ? (
        <span className="w-full shrink-0 text-[0.6875rem] text-muted-foreground @md/workitem:w-24">
          {relationLabel}
        </span>
      ) : null}

      <JiraIssueTypeIcon
        issueType={ticket.issueType ?? ticket.ref.type}
        {...(ticket.issueTypeIconUrl ? { issueTypeIconUrl: ticket.issueTypeIconUrl } : {})}
        className="size-3.5"
      />

      <span className="shrink-0 font-medium tabular-nums text-muted-foreground group-hover/issue-row:text-foreground">
        {ticket.ref.displayId}
      </span>

      {/* A placeholder title is just the key repeated; showing it twice adds nothing. */}
      {isPlaceholder ? (
        <span className="min-w-0 flex-1" />
      ) : (
        <span className="min-w-0 flex-1 truncate text-foreground" title={summary}>
          {summary}
        </span>
      )}

      <WorkItemStatusBadge
        status={{ name: ticket.status }}
        className="ml-auto shrink-0 @xs/workitem:ml-0"
      />

      {/*
        Only shown when someone is actually assigned. An empty placeholder circle in every row is
        noise, and next to a status pill it reads as an unchecked control rather than an absence.
      */}
      {ticket.assignee ? (
        <WorkItemPersonAvatar
          person={{ displayName: ticket.assignee }}
          size="sm"
          className="hidden @md/workitem:inline-flex"
        />
      ) : null}
    </>
  );

  const shared = cn(
    "group/issue-row flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-xs",
    className,
  );

  if (!onOpen) {
    return <div className={shared}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(ticket.id)}
      className={cn(
        shared,
        "text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
      )}
    >
      {content}
    </button>
  );
}

/** Rows share one bordered container so a group of related issues reads as a single object. */
export function WorkItemIssueList({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border/50 overflow-hidden rounded-lg border border-border/70 bg-card/30",
        className,
      )}
    >
      {children}
    </div>
  );
}
