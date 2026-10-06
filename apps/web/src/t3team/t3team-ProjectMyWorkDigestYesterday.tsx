import { ProjectId } from "@t3tools/contracts";
import { useState, type MouseEvent } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { DigestKicker } from "~/t3team/t3team-ProjectMyWorkDigestChips";
import { openDigestPullRequest } from "~/t3team/t3team-digestPrAsideStore";
import { digestPrUrl } from "~/t3team/t3team-projectMyWorkDigestFacts";
import type {
  DigestGraph,
  DigestSection,
  DigestYesterdayMerged,
  DigestYesterdayMoved,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import type { ProjectTicket } from "~/t3team/t3team-types";

/** Rows each list shows before "Show all": yesterday is context, not a worklist. */
const VISIBLE_ROWS = 6;

const rowClassName =
  "flex min-w-0 items-baseline gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/30";
const verbClassName = "w-14 shrink-0 text-2xs uppercase tracking-wide text-muted-foreground";

function MergedRow({ pr }: { pr: DigestYesterdayMerged }) {
  const open = (event: MouseEvent) => {
    // A modified click keeps the browser's own "open in a new tab"; a plain one reads in the aside.
    if (event.metaKey || event.ctrlKey || pr.projectId === "") return;
    event.preventDefault();
    openDigestPullRequest({
      projectId: ProjectId.make(pr.projectId),
      ...(pr.host !== undefined ? { host: pr.host } : {}),
      repository: pr.repo,
      number: pr.number,
    });
  };
  return (
    <a
      href={digestPrUrl(pr)}
      target="_blank"
      rel="noreferrer"
      onClick={open}
      className={rowClassName}
    >
      <span className={verbClassName}>Merged</span>
      <span className="shrink-0 font-mono text-muted-foreground">
        {pr.repo.split("/").at(-1)}#{pr.number}
      </span>
      <span className="min-w-0 flex-1 truncate">{pr.title}</span>
    </a>
  );
}

function MovedRow({
  move,
  ticket,
  onOpenTicket,
}: {
  move: DigestYesterdayMoved;
  ticket: ProjectTicket;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}) {
  return (
    <button
      type="button"
      disabled={!onOpenTicket}
      onClick={() => onOpenTicket?.(ticket.id)}
      className={`${rowClassName} w-full`}
    >
      <span className={verbClassName}>{move.to !== undefined ? "Moved" : "Updated"}</span>
      <span className="shrink-0 font-mono text-muted-foreground">{ticket.ref.displayId}</span>
      <span className="min-w-0 flex-1 truncate">{ticket.ref.title}</span>
      {move.from !== undefined && move.to !== undefined ? (
        <span className="shrink-0 text-2xs text-muted-foreground">
          {move.from} → {move.to}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The `my-work.yesterday` widget: what the viewer merged and which of their tickets moved on their
 * previous working day. Reads the graph itself (`content: "none"`), so the section lists nothing.
 */
export function DigestYesterdayWidget({
  section,
  graph,
  ticketsById,
  onOpenTicket,
}: {
  section: DigestSection;
  graph: DigestGraph;
  ticketsById: ReadonlyMap<string, ProjectTicket>;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}) {
  const [showAll, setShowAll] = useState(false);
  const merged = graph.yesterday?.merged ?? [];
  const moved = (graph.yesterday?.moved ?? []).flatMap((move) => {
    const ticket = ticketsById.get(move.ticketId);
    return ticket ? [{ move, ticket }] : [];
  });
  const total = merged.length + moved.length;
  if (total === 0) return null;
  const limit = showAll ? Number.POSITIVE_INFINITY : VISIBLE_ROWS;
  return (
    <section className="space-y-2">
      <DigestKicker count={total}>{section.heading}</DigestKicker>
      {section.hint ? <p className="text-xs text-muted-foreground">{section.hint}</p> : null}
      <T3SurfacePanel tone="muted" className="divide-y divide-border/60">
        {merged.slice(0, limit).map((pr) => (
          <MergedRow key={pr.id} pr={pr} />
        ))}
        {moved.slice(0, limit).map(({ move, ticket }) => (
          <MovedRow key={ticket.id} move={move} ticket={ticket} onOpenTicket={onOpenTicket} />
        ))}
        {merged.length > VISIBLE_ROWS || moved.length > VISIBLE_ROWS ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="w-full px-3 py-1.5 text-left text-2xs text-muted-foreground hover:bg-accent/30"
          >
            {showAll ? "Show fewer" : "Show all"}
          </button>
        ) : null}
      </T3SurfacePanel>
    </section>
  );
}
