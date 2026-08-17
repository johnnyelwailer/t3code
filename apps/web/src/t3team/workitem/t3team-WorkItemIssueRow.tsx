/* oxlint-disable t3code/no-native-title-tooltip -- Existing merged lint debt; keep green while preserving behavior. */
import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { cn } from "~/t3team/lib/t3team-utils";
import type { ProjectTicket } from "~/t3team/t3team-types";
import { getProjectTicketEstimatePresentation } from "~/t3team/t3team-projectBacklogEstimate";
import { WorkItemPersonChip } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";
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
  estimateControl,
  assigneeControl,
  onOpen,
  className,
}: {
  readonly ticket: ProjectTicket;
  /** Link semantics, e.g. "blocks" or "relates to". Absent for plain children. */
  readonly relationLabel?: string | undefined;
  /** Display name of the signed-in user, so their own rows stand out. */
  readonly currentUserName?: string | undefined;
  /** An interactive estimate picker for this row. Falls back to the read-only label when absent. */
  readonly estimateControl?: React.ReactNode;
  /** An interactive assignee picker for this row. Falls back to a read-only avatar when absent. */
  readonly assigneeControl?: React.ReactNode;
  readonly onOpen?: ((ticketId: string) => void) | undefined;
  readonly className?: string;
}) {
  const summary = ticket.ref.title;
  const isPlaceholder = summary === ticket.ref.displayId;

  /*
    Unit comes from `getProjectTicketEstimatePresentation`, the same resolver the backlog row uses.

    This previously hardcoded "N pts" and preferred `estimateValue` over tracked time, which showed
    story points to a project that estimates in hours. Whether a ticket is hour-tracked or
    point-sized is a property of the project's Jira configuration, not something a row can infer —
    and that question was already answered in one place.
  */
  const estimate = getProjectTicketEstimatePresentation(ticket);
  const estimateLabel =
    estimate.valueText === "" ? undefined : `${estimate.valueText} ${estimate.valueSuffix}`;
  const estimateTitle = estimateLabel ? `${estimate.label}: ${estimateLabel}` : undefined;

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

        Always rendered, sized or not — same reasoning as `assigneeControl` below: an unestimated
        child is exactly the one that most needs sizing, so hiding the affordance then would defeat
        the point. `estimateControl` replaces the label with a real editor where the caller can write.
      */}
      {/*
        Fixed-width trailing columns, so estimate, status and assignee line up down the list instead
        of drifting with each row's title and status-name length. Every row uses the same template,
        which is what makes them align — a flex row cannot, because each row sizes independently.

        The widths step up with the container, and at the narrowest the assignee keeps its avatar but
        drops the name rather than truncating it to a couple of letters.
      */}
      <span
        className={cn(
          /* `pl-4` keeps a truncated title from running straight into the estimate field. */
          "relative z-10 grid shrink-0 items-center gap-x-3 pl-4",
          /*
            The name is dropped here, not by the chip. These columns have definite widths set by the
            row's own container, so the query is answerable; on the chip itself it was not — the chip
            shrinks to its content, so hiding the name shrank the container and the name could never
            reappear. Elsewhere, such as the details panel, the name simply always shows.
          */
          "[&_[data-slot=person-name]]:hidden @2xl/workitem:[&_[data-slot=person-name]]:block",
          "grid-cols-[2rem_5.5rem_1.75rem]",
          "@md/workitem:grid-cols-[2.5rem_7rem_2rem]",
          "@2xl/workitem:grid-cols-[2.5rem_7rem_9.5rem]",
        )}
      >
        <span className="justify-self-end">
          {estimateControl ??
            (estimateLabel ? (
              <span
                className="tabular-nums text-muted-foreground"
                title={estimateTitle}
                aria-label={estimateTitle}
              >
                {estimateLabel}
              </span>
            ) : (
              <span className="tabular-nums text-muted-foreground/50" aria-label="No estimate set">
                —
              </span>
            ))}
        </span>

        <WorkItemStatusBadge status={{ name: ticket.status }} className="justify-self-start" />

        {/*
          Always rendered, assigned or not: an unassigned child is the one most likely to need an
          owner, and hiding the affordance exactly then meant the only way to assign was to open the
          issue. `assigneeControl` replaces the avatar with a real picker where the caller can write.
        */}
        <span className="min-w-0 justify-self-start">
          {assigneeControl ?? (
            <WorkItemPersonChip
              person={ticket.assignee ? { displayName: ticket.assignee } : undefined}
              size="md"
              {...(currentUserName ? { currentUserName } : {})}
            />
          )}
        </span>
      </span>
    </>
  );

  const shared = cn(
    "group/issue-row flex w-full items-center gap-x-2.5 px-3 py-2 text-xs",
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
