import type { MouseEvent } from "react";

import { JiraIssueTypeIcon } from "~/t3team/components/ticket/t3team-JiraIssueType";
import { DigestStatusDot } from "~/t3team/t3team-ProjectMyWorkDigestChips";
import { digestTransitionStyle } from "~/t3team/t3team-digestViewTransition";
import type { ProjectTicket } from "~/t3team/t3team-types";

/**
 * A ticket that is no longer the viewer's to move, in one line: key, title, what of theirs is
 * still open on it ("draft PR open"), and its status. No PR chips, people or linked work — the
 * full row is one click away.
 */
export function DigestCompactRow({
  transitionName,
  ticket,
  why,
  onOpenTicket,
}: {
  transitionName?: string | undefined;
  ticket: ProjectTicket;
  why?: string | undefined;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}) {
  const open = (event: MouseEvent) => {
    event.stopPropagation();
    if (!onOpenTicket || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    onOpenTicket(ticket.id);
  };
  return (
    <a
      href={ticket.ref.url}
      onClick={open}
      data-testid="digest-compact-row"
      style={digestTransitionStyle(transitionName)}
      className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/30"
    >
      <JiraIssueTypeIcon
        issueType={ticket.issueType}
        issueTypeIconUrl={ticket.issueTypeIconUrl}
        className="size-3.5 shrink-0"
      />
      <span className="shrink-0 font-mono text-muted-foreground">{ticket.ref.displayId}</span>
      {/* The title keeps its room; the note gives way first. */}
      <span className="min-w-0 flex-[1_1_auto] truncate font-medium">{ticket.ref.title}</span>
      {why ? (
        <span className="min-w-0 flex-[0_100_auto] truncate text-muted-foreground">{why}</span>
      ) : null}
      <DigestStatusDot status={ticket.status} />
    </a>
  );
}
