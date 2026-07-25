import type { GitHubWorkActivityItem } from "~/t3team/t3team-githubActivity";
import {
  formatPullRequestState,
  getGitHubActivityVisual,
  isActiveReviewRequested,
} from "~/t3team/t3team-githubActivityViewUtils";

function formatReason(reason: string): string {
  return reason.replaceAll("_", " ");
}

function describeGitHubActivity(item: GitHubWorkActivityItem): string {
  if (isActiveReviewRequested(item)) {
    return "Review requested";
  }

  const pullRequestState = formatPullRequestState(item.subjectState);
  if (pullRequestState) {
    return pullRequestState;
  }

  const subjectType = (item.subjectType ?? "").trim().toLowerCase();
  if (subjectType === "pullrequest") {
    return "Pull request";
  }

  const normalizedReason = item.reason.trim().toLowerCase();
  if (
    normalizedReason.includes("workflow") ||
    normalizedReason.includes("ci") ||
    normalizedReason.includes("check") ||
    normalizedReason.includes("build")
  ) {
    return "Workflow activity";
  }
  if (normalizedReason.includes("comment") || normalizedReason.includes("mention")) {
    return "Comment activity";
  }
  if (normalizedReason.includes("review")) {
    return "Review activity";
  }

  return formatReason(item.reason);
}

export function buildGitHubActivityBadgeTitle(input: {
  item: GitHubWorkActivityItem;
  count: number;
}): string {
  const subject = input.item.subjectTitle ?? input.item.repository;
  const summary = `${describeGitHubActivity(input.item)}: ${subject}`;
  if (input.count <= 1) {
    return summary;
  }

  return `${summary} (${String(input.count)} GitHub items)`;
}

export function GitHubActivityTitleBadge({
  items,
  compact = false,
}: {
  items: ReadonlyArray<GitHubWorkActivityItem>;
  compact?: boolean;
}) {
  if (items.length === 0) {
    return null;
  }

  const item = items[0]!;
  const visual = getGitHubActivityVisual(item);
  const badgeTitle = buildGitHubActivityBadgeTitle({ item, count: items.length });

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border border-border/60 bg-muted/35 text-muted-foreground/90 ${compact ? "px-1 py-0.5" : "px-1.5 py-0.5"}`}
      title={badgeTitle}
      aria-label={badgeTitle}
    >
      <visual.Icon className={`size-3 ${visual.iconClassName}`} />
      {items.length > 1 ? (
        <span className="text-[9px] font-medium tabular-nums leading-none">{items.length}</span>
      ) : null}
    </span>
  );
}
