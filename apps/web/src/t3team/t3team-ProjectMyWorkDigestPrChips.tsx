import { ProjectId } from "@t3tools/contracts";
import { Fragment, useState, type MouseEvent } from "react";

import { WatchedPullRequestIndicator } from "~/components/pullRequest/t3team-WatchedPullRequestIndicator";
import { Badge } from "~/t3team/components/ui/t3team-badge";
import { MyWorkChangeRequestSlot } from "~/t3team/packs/t3team-changeRequestSlots";
import { cn } from "~/t3team/lib/t3team-utils";
import { openDigestPullRequest } from "~/t3team/t3team-digestPrAsideStore";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/t3team/components/ui/t3team-tooltip";
import {
  digestPrUrl,
  digestReviewerUrl,
  digestTitleWithoutKey,
} from "~/t3team/t3team-projectMyWorkDigestFacts";
import type { DigestChangeRequest, DigestReviewer } from "~/t3team/t3team-projectMyWorkDigestPlan";
import {
  DIGEST_PR_ACTION_RING,
  DIGEST_PR_STATE,
  digestPrRank,
} from "~/t3team/t3team-projectMyWorkDigestPrState";
import { WorkItemPersonAvatar } from "~/t3team/workitem/t3team-WorkItemPersonAvatar";

/**
 * Reviewer avatars only — the name lives in the tooltip, so the chip row carries no text that
 * repeats what the avatar's initials already say. Two at most, then a count. Each links to the
 * GitHub handle.
 */
export function DigestReviewerStack({
  reviewers,
  host,
}: {
  reviewers: readonly DigestReviewer[];
  host?: string | undefined;
}) {
  if (reviewers.length === 0) return null;
  const shown = reviewers.slice(0, 2);
  const rest = reviewers.length - shown.length;
  return (
    <span className="flex items-center gap-1">
      {shown.map((reviewer) => (
        <Tooltip key={reviewer.login}>
          <TooltipTrigger
            render={
              <a
                href={digestReviewerUrl(reviewer, host)}
                className="inline-flex opacity-80 hover:opacity-100"
                aria-label={`Reviewed by ${reviewer.name}`}
              >
                <WorkItemPersonAvatar
                  person={{
                    displayName: reviewer.name,
                    ...(reviewer.avatarUrl ? { avatarUrl: reviewer.avatarUrl } : {}),
                  }}
                  size="sm"
                />
              </a>
            }
          />
          <TooltipPopup side="top">
            {reviewer.name}
            {reviewer.decision
              ? ` · ${reviewer.decision === "approved" ? "approved" : "requested changes"}`
              : " · reviewing"}
          </TooltipPopup>
        </Tooltip>
      ))}
      {rest > 0 ? (
        <span className="-translate-y-px text-3xs leading-none text-muted-foreground">+{rest}</span>
      ) : null}
    </span>
  );
}

/**
 * One PR as a compact pill: short repo name and number, the title as far as it fits, its state.
 * Hovering shows the whole of it; a click opens it in the dashboard's aside (the app's own PR
 * detail), a middle-click still goes to the host.
 */
export function DigestPrChip({
  pr,
  repoLabel = (repo) => repo,
  showState = true,
}: {
  pr: DigestChangeRequest;
  repoLabel?: (repo: string) => string;
  /** Off where every chip shares one state (a list of merged PRs): the badge would only repeat. */
  showState?: boolean;
}) {
  const state = DIGEST_PR_STATE[pr.state];
  const open = (event: MouseEvent) => {
    event.stopPropagation();
    if (pr.projectId === undefined || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    openDigestPullRequest({
      projectId: ProjectId.make(pr.projectId),
      ...(pr.host !== undefined ? { host: pr.host } : {}),
      repository: pr.repo,
      number: pr.number,
    });
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={digestPrUrl(pr)}
            onClick={open}
            className={cn(
              "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md bg-background/70 px-1.5 py-0.5 text-2xs text-muted-foreground ring-1 ring-border/50 hover:text-foreground hover:ring-border",
              // A verdict or fix owed stands out from the quiet ones, not just its badge.
              DIGEST_PR_ACTION_RING[state.variant],
            )}
          >
            <span className="shrink-0 -translate-y-px font-mono text-3xs leading-none">
              {repoLabel(pr.repo)}#{pr.number}
            </span>
            {pr.title ? (
              <span className="hidden min-w-0 max-w-64 -translate-y-px truncate leading-none text-foreground/80 @sm/prs:inline">
                {digestTitleWithoutKey(pr.title, pr.ticketId)}
              </span>
            ) : null}
            {showState ? (
              <Badge size="sm" variant={state.variant}>
                {state.label}
              </Badge>
            ) : null}
            {pr.additions !== undefined && pr.deletions !== undefined ? (
              <span className="hidden -translate-y-px font-mono text-3xs leading-none tabular-nums @md/prs:inline">
                <span className="text-success">+{pr.additions}</span>{" "}
                <span className="text-destructive">−{pr.deletions}</span>
              </span>
            ) : null}
            <DigestReviewerStack reviewers={pr.reviewers} host={pr.host} />
            <WatchedPullRequestIndicator host={pr.host} repository={pr.repo} number={pr.number} />
            {pr.unhandledComments && pr.unhandledComments > 0 ? (
              <span className="-translate-y-px text-3xs leading-none">
                {pr.unhandledComments} comments
              </span>
            ) : null}
          </a>
        }
      />
      <TooltipPopup side="top" className="max-w-sm">
        <p className="font-medium">{pr.title ?? `${pr.repo}#${pr.number}`}</p>
        <p className="text-muted-foreground">
          {pr.repo}#{pr.number} · {state.label} · updated {pr.updatedAt.slice(0, 10)}
          {pr.additions !== undefined && pr.deletions !== undefined
            ? ` · +${pr.additions} −${pr.deletions}`
            : ""}
        </p>
      </TooltipPopup>
    </Tooltip>
  );
}

const SHOWN_PRS = 3;

/** A ticket's PRs, owed action first and drafts last; past three, the rest fold behind "+N". */
export function DigestPrChips({
  prs,
  repoLabel,
  showState = true,
}: {
  prs: readonly DigestChangeRequest[];
  repoLabel?: (repo: string) => string;
  showState?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (prs.length === 0) return null;
  const ordered = prs.toSorted((a, b) => digestPrRank(a) - digestPrRank(b));
  const shown = expanded ? ordered : ordered.slice(0, SHOWN_PRS);
  const hidden = ordered.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {shown.map((pr) => (
        <Fragment key={pr.id}>
          <DigestPrChip pr={pr} showState={showState} {...(repoLabel ? { repoLabel } : {})} />
          {/* Beside the chip, never inside its link. */}
          <MyWorkChangeRequestSlot changeRequest={pr} density="chip" />
        </Fragment>
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          className="text-3xs text-muted-foreground hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded(true);
          }}
        >
          +{hidden} more
        </button>
      ) : null}
    </div>
  );
}
