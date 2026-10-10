import { ProjectId } from "@t3tools/contracts";
import type { MouseEvent } from "react";

import { WatchedPullRequestIndicator } from "~/components/pullRequest/t3team-WatchedPullRequestIndicator";
import { T3SurfacePanel } from "~/t3team/components/ui/t3team-surface";
import { MyWorkChangeRequestSlot } from "~/t3team/packs/t3team-changeRequestSlots";
import { DigestKicker, formatDigestAgo } from "~/t3team/t3team-ProjectMyWorkDigestChips";
import { DigestItemActions } from "~/t3team/t3team-ProjectMyWorkDigestActions";
import { openDigestPullRequest } from "~/t3team/t3team-digestPrAsideStore";
import {
  digestPrUrl,
  digestReviewActions,
  digestTitleWithoutKey,
} from "~/t3team/t3team-projectMyWorkDigestFacts";
import type {
  DigestGraph,
  DigestPrPerson,
  DigestReviewRequest,
  DigestSection,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";

/**
 * A person: their GitHub face and first name. Where the panel is narrow the face carries it alone
 * (name on hover); a person without a face shows the name only — never a letter beside the word.
 */
function DigestPersonPill({ person }: { person: DigestPrPerson }) {
  const first = person.name.split(" ")[0];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="inline-flex items-center gap-1 text-foreground/80"
            aria-label={person.name}
          >
            <WorkItemPersonAvatar
              person={{
                displayName: person.name,
                ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
              }}
              size="sm"
              {...(person.avatarUrl ? {} : { className: "@md/reviews:hidden" })}
            />
            <span className="hidden @md/reviews:inline">{first}</span>
          </span>
        }
      />
      <TooltipPopup side="top">{person.name}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Who else is on it. Someone who already commented makes this PR less urgent for the viewer;
 * nobody yet is said plainly, since that is the one that waits on them alone.
 */
function ReviewCoverage({ review }: { review: DigestReviewRequest }) {
  const engaged = review.engaged ?? [];
  const asked = (review.reviewers ?? []).filter(
    (reviewer) => !engaged.some((person) => person.login === reviewer.login),
  );
  // Not read yet: claim nothing rather than "nobody has reviewed".
  if (review.engaged === undefined) return null;
  return (
    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {engaged.length > 0 ? (
        <>
          <span>already on it</span>
          {engaged.slice(0, 3).map((person) => (
            <DigestPersonPill key={person.login} person={person} />
          ))}
        </>
      ) : (
        <span className="text-warning">nobody has reviewed yet</span>
      )}
      {asked.length > 0 ? (
        <>
          <span>· also asked</span>
          {asked.slice(0, 3).map((person) => (
            <DigestPersonPill key={person.login} person={person} />
          ))}
        </>
      ) : null}
    </p>
  );
}

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
    <section className="@container/reviews space-y-2">
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
          // The PR is the row's link; the ticket key and the next-step pills sit beside it as their
          // own buttons, never a link inside a link.
          return (
            <div key={review.id} className="group px-3 py-2 hover:bg-accent/30">
              <div className="flex min-w-0 items-start gap-2">
                <a
                  href={digestPrUrl(review)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={openPullRequest}
                  className="block min-w-0 flex-1"
                >
                  <p className="line-clamp-2 break-words text-sm font-medium leading-5">
                    {digestTitleWithoutKey(review.title, review.workItemKey)}
                  </p>
                  <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {review.author ? <DigestPersonPill person={review.author} /> : null}
                    <span>updated {formatDigestAgo(nowMs, review.updatedAt)} ago</span>
                    <span className="truncate font-mono">
                      {review.repo}#{review.number}
                    </span>
                    <WatchedPullRequestIndicator
                      host={review.host}
                      repository={review.repo}
                      number={review.number}
                    />
                    {review.additions !== undefined && review.deletions !== undefined ? (
                      <span className="font-mono tabular-nums">
                        <span className="text-success">+{review.additions}</span>{" "}
                        <span className="text-destructive">−{review.deletions}</span>
                      </span>
                    ) : null}
                  </p>
                  <ReviewCoverage review={review} />
                </a>
                {/* Key on top, next step under it: the PR text column is taller, so the pill costs
                    the row no extra line. */}
                <div className="flex shrink-0 flex-col items-end">
                  {review.workItemKey ? (
                    <button
                      type="button"
                      disabled={!review.ticketId}
                      onClick={openTicket}
                      className="font-mono text-xs text-muted-foreground enabled:text-foreground enabled:hover:underline"
                    >
                      {review.workItemKey}
                    </button>
                  ) : null}
                  <DigestItemActions actions={digestReviewActions(review)} />
                  <MyWorkChangeRequestSlot changeRequest={review} density="row" />
                </div>
              </div>
            </div>
          );
        })}
      </T3SurfacePanel>
    </section>
  );
}
