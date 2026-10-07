import { useId, useState, type MouseEvent, type ReactNode } from "react";

import { cn } from "~/t3team/lib/t3team-utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import {
  digestQuietSummary,
  type DigestAdjacentItem,
  type DigestStoryAdjacency,
} from "~/t3team/t3team-projectMyWorkDigestAdjacency";
import { digestStatusDotClassName } from "~/t3team/t3team-ProjectMyWorkDigestChips";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

// Said from the viewer's ticket, the way the dependency line reads it.
const LEAD: Record<DigestAdjacentItem["relation"], string | null> = {
  "blocks-you": "blocked by",
  "waits-on-you": "blocks",
  sibling: null,
};

const PILL =
  "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs ring-1";

function relationNote(item: DigestAdjacentItem): string | null {
  if (!item.viewerTicketKey) return null;
  return item.relation === "blocks-you"
    ? `Blocks your ${item.viewerTicketKey}`
    : `Waits on your ${item.viewerTicketKey}`;
}

/** One adjacent ticket: key, status dot, assignee face; title and status in the tooltip. */
function DigestAdjacentPill({
  item,
  onOpenTicket,
}: {
  item: DigestAdjacentItem;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}) {
  const open = (event: MouseEvent) => {
    event.stopPropagation();
    if (onOpenTicket && item.ticketId && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      onOpenTicket(item.ticketId);
    }
  };
  const lead = LEAD[item.relation];
  const note = relationNote(item);
  const pill = {
    onClick: open,
    "aria-label": `${item.key} · ${item.status}`,
    className: cn(
      PILL,
      item.relation === "blocks-you"
        ? "bg-warning/10 text-warning ring-warning/40 hover:ring-warning/70"
        : "bg-background/70 text-muted-foreground ring-border/50 hover:text-foreground hover:ring-border",
    ),
  };
  const content: ReactNode = (
    <>
      {lead ? <span className="shrink-0 text-3xs leading-none">{lead}</span> : null}
      <span className="shrink-0 font-mono text-3xs leading-none">{item.key}</span>
      <span aria-hidden="true" className={digestStatusDotClassName(item.status)} />
      {item.assignee ? (
        <WorkItemPersonAvatar
          person={{
            displayName: item.assignee,
            ...(item.assigneeAvatarUrl ? { avatarUrl: item.assigneeAvatarUrl } : {}),
          }}
          size="sm"
        />
      ) : null}
    </>
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          // Without a URL the pill is still a control (it opens the ticket in the app), so it
          // stays a button rather than an anchor that cannot take focus.
          item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" {...pill}>
              {content}
            </a>
          ) : (
            <button type="button" {...pill}>
              {content}
            </button>
          )
        }
      />
      <TooltipPopup side="top" className="max-w-sm">
        <p className="font-medium">
          {item.key} · {item.title}
        </p>
        <p className="text-muted-foreground">
          {item.assignee ?? "Unassigned"} · {item.status}
        </p>
        {note ? <p className="text-muted-foreground">{note}</p> : null}
      </TooltipPopup>
    </Tooltip>
  );
}

/**
 * The work around the viewer's rows, below them and quieter: open blocks and active siblings as
 * pills, the rest folded into one count that unfolds in place. The pills carry the people, so
 * there is no separate "same story" line of faces.
 */
export function DigestAdjacentWork({
  adjacency,
  onOpenTicket,
}: {
  adjacency: DigestStoryAdjacency;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const { active, quiet } = adjacency;
  if (active.length === 0 && quiet.length === 0) return null;
  const shown = expanded ? [...active, ...quiet] : active;
  return (
    <div
      id={listId}
      className="flex min-w-0 flex-wrap items-center gap-1 border-t border-border/50 bg-muted/20 px-3 py-1.5"
    >
      {shown.map((item) => (
        <DigestAdjacentPill key={item.key} item={item} onOpenTicket={onOpenTicket} />
      ))}
      {quiet.length > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          className={cn(
            PILL,
            "text-muted-foreground ring-transparent hover:text-foreground hover:ring-border/50",
          )}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
        >
          {expanded ? "show less" : `+ ${digestQuietSummary(quiet)}`}
        </button>
      ) : null}
    </div>
  );
}
