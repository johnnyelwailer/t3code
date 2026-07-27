import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { cn } from "~/t3team/lib/t3team-utils";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { formatWorkItemDuration } from "~/t3team/workitem/t3team-workItemFieldModel";
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
  currentUserName,
  assigneeControl,
  onOpen,
  className,
}: {
  readonly ticket: ProjectTicket;
  /** Link semantics, e.g. "blocks" or "relates to". Absent for plain children. */
  readonly relationLabel?: string | undefined;
  /** Display name of the signed-in user, so their own rows stand out. */
  readonly currentUserName?: string | undefined;
  /** An interactive assignee picker for this row. Falls back to a read-only avatar when absent. */
  readonly assigneeControl?: React.ReactNode;
  readonly onOpen?: ((ticketId: string) => void) | undefined;
  readonly className?: string;
}) {
  const summary = ticket.ref.title;
  const isAssignedToCurrentUser =
    currentUserName !== undefined &&
    ticket.assignee !== undefined &&
    ticket.assignee.trim().toLowerCase() === currentUserName.trim().toLowerCase();
  const isPlaceholder = summary === ticket.ref.displayId;

  /*
    A child row without an owner or a size is not much of a plan. Both were already on the ticket —
    the row simply never rendered them, so a list of children read as titles and nothing else.
  */
  const estimateSeconds =
    ticket.timeOriginalEstimateSeconds ?? ticket.aggregateTimeOriginalEstimateSeconds;
  const estimateLabel =
    ticket.estimateValue !== undefined
      ? `${ticket.estimateValue} pts`
      : formatWorkItemDuration(estimateSeconds);
  const estimateTitle =
    ticket.estimateValue !== undefined
      ? `${ticket.estimateValue} story points`
      : `Estimated ${estimateLabel}`;

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

      {/*
        Estimate before status, matching the title band's order. Story points win over a time
        estimate when both exist — a team that sizes in points does not want hours quoted back.
      */}
      {estimateLabel ? (
        <span
          className="shrink-0 tabular-nums text-muted-foreground"
          title={estimateTitle}
          aria-label={estimateTitle}
        >
          {estimateLabel}
        </span>
      ) : null}

      <WorkItemStatusBadge
        status={{ name: ticket.status }}
        className="ml-auto shrink-0 @xs/workitem:ml-0"
      />

      {/*
        Always rendered, assigned or not: an unassigned child is the one most likely to need an
        owner, and hiding the affordance exactly then meant the only way to assign was to open the
        issue. `assigneeControl` replaces the avatar with a real picker where the caller can write.
      */}
      <span className="relative z-10 shrink-0">
        {assigneeControl ?? (
          <WorkItemPersonAvatar
            person={ticket.assignee ? { displayName: ticket.assignee } : undefined}
            size="md"
            isCurrentUser={isAssignedToCurrentUser}
          />
        )}
      </span>
    </>
  );

  const shared = cn(
    "group/issue-row flex w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 text-xs",
    className,
  );

  if (!onOpen) {
    return <div className={shared}>{content}</div>;
  }

  /*
    The open affordance is an overlay rather than a wrapping <button>. Wrapping put the row's own
    controls inside a button — invalid HTML, and it breaks keyboard and screen-reader use of
    anything interactive in the row. The overlay sits beneath the controls, which lift above it.
  */
  return (
    <div
      className={cn(
        shared,
        "group/issue-row relative transition-colors hover:bg-accent/40 focus-within:bg-accent/20",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(ticket.id)}
        aria-label={`Open ${ticket.ref.displayId}${isPlaceholder ? "" : `: ${summary}`}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      />
      {content}
    </div>
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
