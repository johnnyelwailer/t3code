import type {
  GitHubPullRequestContextIssueComment,
  GitHubPullRequestContextResponse,
  GitHubPullRequestContextReview,
  GitHubPullRequestContextReviewComment,
} from "~/t3work/backend/t3work-githubTypes";

export type GitHubPullRequestRichTextDocument = {
  readonly id: string;
  readonly label: string;
  readonly baseUrl?: string | undefined;
  readonly markdown?: string | null | undefined;
  readonly html?: string | null | undefined;
};

export function pullRequestDescriptionDocumentId(): string {
  return "pull-request-description";
}

export function pullRequestReviewDocumentId(
  review: GitHubPullRequestContextReview,
  index: number,
): string {
  return `pull-request-review:${String(review.id ?? index)}`;
}

export function pullRequestReviewCommentDocumentId(
  comment: GitHubPullRequestContextReviewComment,
  index: number,
): string {
  return `pull-request-review-comment:${String(comment.id ?? index)}`;
}

export function pullRequestIssueCommentDocumentId(
  comment: GitHubPullRequestContextIssueComment,
  index: number,
): string {
  return `pull-request-issue-comment:${String(comment.id ?? index)}`;
}

export function collectGitHubPullRequestRichTextDocuments(
  context: GitHubPullRequestContextResponse,
): ReadonlyArray<GitHubPullRequestRichTextDocument> {
  return [
    {
      id: pullRequestDescriptionDocumentId(),
      label: "Pull request description",
      baseUrl: context.pullRequest.html_url,
      markdown: context.pullRequest.body ?? context.pullRequest.body_text,
      html: context.pullRequest.body_html,
    },
    ...context.reviews.map((review, index) => ({
      id: pullRequestReviewDocumentId(review, index),
      label: `Review ${String(review.id ?? index + 1)}`,
      baseUrl: review.html_url ?? context.pullRequest.html_url,
      markdown: review.body ?? review.body_text,
      html: review.body_html,
    })),
    ...context.reviewComments.map((comment, index) => ({
      id: pullRequestReviewCommentDocumentId(comment, index),
      label: `Review comment ${String(comment.id ?? index + 1)}`,
      baseUrl: comment.html_url ?? context.pullRequest.html_url,
      markdown: comment.body ?? comment.body_text,
      html: comment.body_html,
    })),
    ...context.issueComments.map((comment, index) => ({
      id: pullRequestIssueCommentDocumentId(comment, index),
      label: `Issue comment ${String(comment.id ?? index + 1)}`,
      baseUrl: comment.html_url ?? context.pullRequest.html_url,
      markdown: comment.body ?? comment.body_text,
      html: comment.body_html,
    })),
  ];
}
