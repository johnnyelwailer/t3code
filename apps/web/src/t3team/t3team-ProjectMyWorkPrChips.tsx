import type { MouseEvent } from "react";

import { WatchedPullRequestIndicator } from "~/components/pullRequest/t3team-WatchedPullRequestIndicator";
import { Badge } from "~/t3team/components/ui/t3team-badge";
import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import { pullRequestIdentityOfActivityItem } from "~/t3team/t3team-githubActivityPullRequestIdentity";

const MAX_SHOWN_PULL_REQUESTS = 2;

// Same pill as the digest's PR chips (t3team-ProjectMyWorkDigestPrChips), so a related PR reads
// the same on every My Work lens.
const CHIP_CLASS_NAME =
  "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md bg-background/70 px-1.5 py-0.5 text-2xs text-muted-foreground ring-1 ring-border/50 hover:ring-border";

/** The ticket's related PRs that are still open (drafts included), newest first as matched. */
export function selectOpenPullRequests(
  items: ReadonlyArray<GitHubWorkActivityItem>,
): ReadonlyArray<GitHubWorkActivityItem> {
  return items.filter(
    (item) =>
      item.subjectType === "PullRequest" &&
      (item.subjectState === "open" || item.subjectState === "draft"),
  );
}

/** `host:owner/repo#123` ids and `/pull/123` URLs both carry the PR number. */
export function readPullRequestNumber(item: GitHubWorkActivityItem): string | undefined {
  return item.id.match(/#(\d+)$/)?.[1] ?? item.subjectUrl?.match(/\/pull\/(\d+)/)?.[1];
}

function stopRowActivation(event: MouseEvent) {
  event.stopPropagation();
}

function ProjectMyWorkPrChip({ pr }: { pr: GitHubWorkActivityItem }) {
  const number = readPullRequestNumber(pr);
  const reference = number ? `#${number}` : pr.repository;
  const state = pr.subjectState === "draft" ? "draft" : "open";
  const identity = pullRequestIdentityOfActivityItem(pr);
  const content = (
    <>
      <span className="font-mono text-3xs leading-none">{reference}</span>
      <Badge size="sm" variant="secondary">
        {state}
      </Badge>
      {pr.subjectTitle ? <span className="min-w-0 truncate">{pr.subjectTitle}</span> : null}
      {identity ? <WatchedPullRequestIndicator {...identity} /> : null}
    </>
  );
  const label = `${pr.repository}${number ? `#${number}` : ""} ${state}: ${pr.subjectTitle ?? ""}`;
  if (!pr.subjectUrl) {
    return (
      <span className={CHIP_CLASS_NAME} aria-label={label}>
        {content}
      </span>
    );
  }
  return (
    <a
      href={pr.subjectUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className={`${CHIP_CLASS_NAME} hover:text-foreground`}
      onClick={stopRowActivation}
    >
      {content}
    </a>
  );
}

/**
 * Compact open-PR chips for a My Work ticket row or card: number, state and title for at most two
 * PRs, then a "+N" count. Renders nothing when the ticket has no open PR.
 */
export function ProjectMyWorkPrChips({ items }: { items: ReadonlyArray<GitHubWorkActivityItem> }) {
  const openPullRequests = selectOpenPullRequests(items);
  if (openPullRequests.length === 0) return null;
  const shown = openPullRequests.slice(0, MAX_SHOWN_PULL_REQUESTS);
  const overflow = openPullRequests.length - shown.length;
  return (
    <div
      className="mt-1 flex min-w-0 flex-wrap items-center gap-1 px-1"
      data-testid="my-work-pr-chips"
    >
      {shown.map((pr) => (
        <ProjectMyWorkPrChip key={pr.id} pr={pr} />
      ))}
      {overflow > 0 ? (
        <span className="text-3xs leading-none text-muted-foreground">+{overflow}</span>
      ) : null}
    </div>
  );
}
