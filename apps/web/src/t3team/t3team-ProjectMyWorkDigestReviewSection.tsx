import { ProjectId } from "@t3tools/contracts";
import type { MouseEvent } from "react";

import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { DigestKicker, formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestChips";
import { openDigestPullRequest } from "~/t3team/t3team-digestPrAsideStore";
import { digestPrUrl } from "~/t3team/t3team-projectMyWorkDigestFacts";
import type { DigestGraph, DigestSection } from "~/t3team/t3team-projectMyWorkDigestPlan";

/**
 * A `reviews` section: other people's PRs waiting for the viewer, one row each — title, where it
 * lives, how long it has waited, and the ticket it belongs to (a link when the digest holds it).
 * Kept apart from the viewer's own tickets on purpose: what you owe a colleague, not what you own.
 */
export function DigestReviewSection({
  section,
  graph,
  nowMs,
  onOpenTicket,
}: {
  section: DigestSection;
  graph: DigestGraph;
  nowMs: number;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
}) {
  const byId = new Map((graph.reviewRequests ?? []).map((review) => [review.id, review]));
  const reviews = (section.reviewIds ?? []).flatMap((id) => {
    const review = byId.get(id);
    return review ? [review] : [];
  });
  return (
    <section className="space-y-2">
      <DigestKicker count={reviews.length}>{section.heading}</DigestKicker>
      {section.hint ? <p className="text-xs text-muted-foreground">{section.hint}</p> : null}
      <T3SurfacePanel tone="default" className="divide-y divide-border/60">
        {reviews.map((review) => {
          const openTicket = (event: MouseEvent) => {
            if (!review.ticketId || !onOpenTicket) return;
            event.preventDefault();
            event.stopPropagation();
            onOpenTicket(review.ticketId);
          };
          const openPullRequest = (event: MouseEvent) => {
            if (event.metaKey || event.ctrlKey || review.projectId === "") return;
            event.preventDefault();
            openDigestPullRequest({
              projectId: ProjectId.make(review.projectId),
              ...(review.host !== undefined ? { host: review.host } : {}),
              repository: review.repo,
              number: review.number,
            });
          };
          // The PR is the row's link; the ticket key sits beside it as its own button, never a
          // link inside a link.
          return (
            <div
              key={review.id}
              className="flex min-w-0 items-start gap-2 px-3 py-2 hover:bg-accent/30"
            >
              <a
                href={digestPrUrl(review)}
                target="_blank"
                rel="noreferrer"
                onClick={openPullRequest}
                className="block min-w-0 flex-1"
              >
                <p className="line-clamp-2 break-words text-sm font-medium leading-5">
                  {review.title}
                </p>
                <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="truncate font-mono">
                    {review.repo}#{review.number}
                  </span>
                  <span className={review.author ? "text-warning" : undefined}>
                    {review.author ? `${review.author} waiting` : "waiting"}{" "}
                    {formatDigestAgo(nowMs, review.updatedAt)}
                  </span>
                </p>
              </a>
              {review.workItemKey ? (
                <button
                  type="button"
                  disabled={!review.ticketId}
                  onClick={openTicket}
                  className="shrink-0 font-mono text-xs text-muted-foreground enabled:text-foreground enabled:hover:underline"
                >
                  {review.workItemKey}
                </button>
              ) : null}
            </div>
          );
        })}
      </T3SurfacePanel>
    </section>
  );
}
