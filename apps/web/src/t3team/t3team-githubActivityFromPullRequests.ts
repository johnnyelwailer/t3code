import type { PullRequestListEntry } from "@t3tools/contracts";

import {
  extractWorkItemKey,
  normalizeWorkItemKey,
  sortGitHubActivityItems,
  type GitHubWorkActivityItem,
} from "~/t3team/t3team-githubActivity";

/**
 * Ticket↔PR matching (`groupGitHubActivityByWorkItem`) used to run over the fork's own GitHub
 * inbox notifications; it now runs over upstream's `pullRequestEnvironment.list` rows instead.
 * This is the adapter for that swap: it produces the same `GitHubWorkActivityItem` shape the
 * matching logic already reads, so that logic itself needs no change — only its input does.
 */
export function toGitHubWorkActivityItemsFromPullRequestEntries(
  entries: ReadonlyArray<PullRequestListEntry>,
): ReadonlyArray<GitHubWorkActivityItem> {
  return sortGitHubActivityItems(
    entries.map((entry) => {
      const workItemKey = normalizeWorkItemKey(
        extractWorkItemKey(entry.title) ??
          extractWorkItemKey(entry.headBranch) ??
          extractWorkItemKey(entry.repository) ??
          undefined,
      );

      return {
        id: `${entry.host}:${entry.repository}#${String(entry.number)}`,
        repository: entry.repository,
        // A listing row's own `reason` is not a host-reported field like the inbox notifications
        // carried; it is reconstructed from what the row already says about this viewer.
        reason: entry.viewerReviewRequested ? "review_requested" : "subscribed",
        ...(entry.author?.login ? { authorLogin: entry.author.login } : {}),
        ...(entry.author?.avatarUrl ? { authorAvatarUrl: entry.author.avatarUrl } : {}),
        reviewRequested: entry.viewerReviewRequested,
        subjectType: "PullRequest",
        subjectTitle: entry.title,
        subjectUrl: entry.url,
        subjectBranch: entry.headBranch,
        subjectState: entry.isDraft ? "draft" : entry.state,
        // A listing row carries 0/0 until `listStats` reads the real counts separately (see
        // pullRequestEnvironment.listStats) — GitHub is the one host that fills them in on the
        // listing itself. Omitting the pair rather than sending literal zeros keeps a consumer
        // that renders "+N / -M only when present" from drawing "+0 / -0" for a row nothing has
        // measured yet.
        ...(entry.additions > 0 || entry.deletions > 0
          ? { additions: entry.additions, deletions: entry.deletions }
          : {}),
        updatedAt: entry.updatedAt,
        ...(workItemKey ? { workItemKey } : {}),
      } satisfies GitHubWorkActivityItem;
    }),
  );
}
