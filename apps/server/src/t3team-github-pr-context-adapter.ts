import type { PullRequestActivity, PullRequestActor, PullRequestDetail } from "@t3tools/contracts";

import type {
  GitHubPullRequestContextAuthor,
  GitHubPullRequestContextCommit,
  GitHubPullRequestContextDetails,
  GitHubPullRequestContextIssueComment,
  GitHubPullRequestContextReview,
  GitHubPullRequestContextReviewComment,
} from "./t3team-github-routes-pr-types.ts";

/**
 * Maps upstream's normalized `PullRequestDetail`/`PullRequestActivity` shapes onto the raw
 * GitHub-REST-flavored `GitHubPullRequestContext*` shapes the pr-context bundle renderers already
 * read, so those renderers need no changes — only where their inputs come from changes.
 */

function toAuthor(
  actor: PullRequestActor | null | undefined,
): GitHubPullRequestContextAuthor | undefined {
  if (!actor) return undefined;
  return {
    login: actor.login,
    ...(actor.avatarUrl ? { avatar_url: actor.avatarUrl } : {}),
  };
}

export function toGitHubPullRequestDetails(
  detail: PullRequestDetail,
  activity: PullRequestActivity,
): GitHubPullRequestContextDetails {
  const reviewCommentCount = activity.comments.filter(
    (comment) => comment.kind === "review-comment",
  ).length;
  const author = toAuthor(detail.author);

  return {
    number: detail.number,
    title: detail.title,
    // Upstream's `state` already folds "merged" in; GitHub's REST `state` is only open/closed,
    // with `merged_at` carrying the rest — so a merged request is reported closed-and-merged.
    state: detail.state === "merged" ? "closed" : detail.state,
    draft: detail.isDraft,
    merged_at: detail.mergedAt,
    html_url: detail.url,
    body: detail.body,
    body_text: detail.body,
    created_at: detail.createdAt,
    updated_at: detail.updatedAt,
    comments: activity.commentCount,
    review_comments: reviewCommentCount,
    additions: detail.additions,
    deletions: detail.deletions,
    changed_files: detail.changedFiles,
    commits: activity.commits.length,
    ...(author ? { user: author } : {}),
    base: { ref: detail.baseBranch },
    head: { ref: detail.headBranch },
  };
}

export function toGitHubReviews(
  activity: PullRequestActivity,
): ReadonlyArray<GitHubPullRequestContextReview> {
  return activity.comments
    .filter((comment) => comment.kind === "review")
    .map((comment): GitHubPullRequestContextReview => {
      const author = toAuthor(comment.author);
      return {
        ...(author ? { user: author } : {}),
        body: comment.body,
        body_text: comment.body,
        ...(comment.reviewState ? { state: comment.reviewState } : {}),
        submitted_at: comment.createdAt,
        ...(comment.url ? { html_url: comment.url } : {}),
      };
    });
}

/**
 * `PullRequestComment` has no line/side of its own — those live on the diff-anchored
 * `reviewThreads` this activity also carries. This cross-references the two by comment id so a
 * review comment keeps the line number the original raw-GitHub shape always gave it.
 */
export function toGitHubReviewComments(
  activity: PullRequestActivity,
): ReadonlyArray<GitHubPullRequestContextReviewComment> {
  const lineByCommentId = new Map<string, { path: string; line: number | null }>();
  for (const thread of activity.reviewThreads) {
    for (const threadComment of thread.comments) {
      lineByCommentId.set(threadComment.id, { path: thread.path, line: thread.line });
    }
  }

  return activity.comments
    .filter((comment) => comment.kind === "review-comment")
    .map((comment): GitHubPullRequestContextReviewComment => {
      const located = lineByCommentId.get(comment.id);
      const author = toAuthor(comment.author);
      return {
        ...(author ? { user: author } : {}),
        body: comment.body,
        body_text: comment.body,
        ...(comment.path ? { path: comment.path } : located ? { path: located.path } : {}),
        ...(located?.line ? { line: located.line } : {}),
        created_at: comment.createdAt,
        updated_at: comment.createdAt,
        ...(comment.url ? { html_url: comment.url } : {}),
      };
    });
}

export function toGitHubIssueComments(
  activity: PullRequestActivity,
): ReadonlyArray<GitHubPullRequestContextIssueComment> {
  return activity.comments
    .filter((comment) => comment.kind === "issue-comment")
    .map((comment): GitHubPullRequestContextIssueComment => {
      const author = toAuthor(comment.author);
      return {
        ...(author ? { user: author } : {}),
        body: comment.body,
        body_text: comment.body,
        created_at: comment.createdAt,
        updated_at: comment.createdAt,
        ...(comment.url ? { html_url: comment.url } : {}),
      };
    });
}

export function toGitHubCommits(
  activity: PullRequestActivity,
): ReadonlyArray<GitHubPullRequestContextCommit> {
  return activity.commits.map((commit): GitHubPullRequestContextCommit => {
    const author = commit.authors?.[0];
    return {
      sha: commit.oid,
      commit: {
        message: commit.messageHeadline,
        author: {
          ...(author?.name ? { name: author.name } : {}),
          date: commit.committedDate,
        },
      },
    };
  });
}
