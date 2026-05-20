import type {
  GitHubPullRequestContextFile,
  GitHubPullRequestContextResponse,
} from "~/t3work/backend/t3work-githubTypes";
import {
  pullRequestIssueCommentDocumentId,
  pullRequestReviewCommentDocumentId,
  pullRequestReviewDocumentId,
} from "~/t3work/t3work-githubPullRequestContextDocuments";

export function renderBody(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "_No content provided._";
}

export function shortSha(value: string | undefined): string {
  return typeof value === "string" && value.length > 7 ? value.slice(0, 7) : (value ?? "unknown");
}

export function renderFileSummary(file: GitHubPullRequestContextFile, patchPath?: string): string {
  const lines = [`## ${file.filename ?? "unknown"}`];
  if (file.status) lines.push(`- Status: ${file.status}`);
  if (typeof file.additions === "number" || typeof file.deletions === "number") {
    lines.push(`- Diff stats: +${String(file.additions ?? 0)} / -${String(file.deletions ?? 0)}`);
  }
  if (typeof file.changes === "number") lines.push(`- Changes: ${String(file.changes)}`);
  if (file.previous_filename) lines.push(`- Previous path: ${file.previous_filename}`);
  if (patchPath) lines.push(`- Patch file: ${patchPath}`);
  return lines.join("\n");
}

export function renderOverviewMarkdown(input: {
  context: GitHubPullRequestContextResponse;
  descriptionPath: string;
  diffPath: string;
  filesSummaryPath: string;
  reviewsSummaryPath: string;
  reviewCommentsSummaryPath: string;
  issueCommentsSummaryPath: string;
  commitsSummaryPath: string;
  snapshotsIndexPath: string;
  warnings?: ReadonlyArray<string>;
  assetsIndexPath?: string;
  assetCount?: number;
  downloadedAssetCount?: number;
  failedAssetCount?: number;
}): string {
  const { context } = input;
  const warnings = input.warnings ?? context.warnings;
  return [
    `# Pull Request #${String(context.pullRequestNumber)}: ${context.pullRequest.title ?? context.repository}`,
    "",
    `- Repository: ${context.repository}`,
    `- Host: ${context.host}`,
    `- State: ${context.pullRequest.state ?? "unknown"}`,
    ...(context.pullRequest.html_url ? [`- URL: ${context.pullRequest.html_url}`] : []),
    ...(context.pullRequest.user?.login ? [`- Author: ${context.pullRequest.user.login}`] : []),
    ...(context.pullRequest.base?.ref || context.pullRequest.head?.ref
      ? [
          `- Branches: ${context.pullRequest.base?.ref ?? "unknown"} <- ${context.pullRequest.head?.ref ?? "unknown"}`,
        ]
      : []),
    `- Changed files: ${String(context.files.length)}`,
    `- Reviews: ${String(context.reviews.length)}`,
    `- Review comments: ${String(context.reviewComments.length)}`,
    `- Issue comments: ${String(context.issueComments.length)}`,
    `- Commits: ${String(context.commits.length)}`,
    ...(typeof input.assetCount === "number"
      ? [
          `- Remote images: ${String(input.downloadedAssetCount ?? 0)} / ${String(input.assetCount)} bundled locally`,
          ...(typeof input.failedAssetCount === "number"
            ? [`- Remote image download failures: ${String(input.failedAssetCount)}`]
            : []),
        ]
      : []),
    ...(warnings && warnings.length > 0
      ? ["", "## Warnings", "", ...warnings.map((warning) => `- ${warning}`)]
      : []),
    "",
    "## Key Artifacts",
    "",
    `- Description: ${input.descriptionPath}`,
    ...(context.diff ? [`- Diff: ${input.diffPath}`] : []),
    `- Changed files summary: ${input.filesSummaryPath}`,
    `- Reviews summary: ${input.reviewsSummaryPath}`,
    `- Review comments summary: ${input.reviewCommentsSummaryPath}`,
    `- Issue comments summary: ${input.issueCommentsSummaryPath}`,
    `- Commits summary: ${input.commitsSummaryPath}`,
    `- File snapshots index: ${input.snapshotsIndexPath}`,
    ...(input.assetsIndexPath ? [`- Remote assets index: ${input.assetsIndexPath}`] : []),
  ].join("\n");
}

export function renderFilesSummaryMarkdown(input: {
  context: GitHubPullRequestContextResponse;
  patchPathByFilename: ReadonlyMap<string, string>;
}): string {
  return [
    "# Changed Files",
    "",
    ...input.context.files.map((file) =>
      renderFileSummary(file, input.patchPathByFilename.get(file.filename ?? "")),
    ),
  ].join("\n\n");
}

export function renderReviewsSummaryMarkdown(
  context: GitHubPullRequestContextResponse,
  resolveAssetLinks?: (documentId: string) => ReadonlyArray<string>,
): string {
  return [
    "# Reviews",
    "",
    ...context.reviews.map((review, index) => {
      const assetLinks = resolveAssetLinks?.(pullRequestReviewDocumentId(review, index)) ?? [];
      return [
        `## ${review.state ?? "Review"} by ${review.user?.login ?? "unknown"}`,
        ...(review.submitted_at ? [`- Submitted: ${review.submitted_at}`] : []),
        ...(review.commit_id ? [`- Commit: ${shortSha(review.commit_id)}`] : []),
        ...assetLinks.map((assetPath) => `- Local image asset: ${assetPath}`),
        "",
        renderBody(review.body ?? review.body_text),
      ].join("\n");
    }),
  ].join("\n\n");
}

export function renderReviewCommentsSummaryMarkdown(
  context: GitHubPullRequestContextResponse,
  resolveAssetLinks?: (documentId: string) => ReadonlyArray<string>,
): string {
  return [
    "# Review Comments",
    "",
    ...context.reviewComments.map((comment, index) => {
      const assetLinks =
        resolveAssetLinks?.(pullRequestReviewCommentDocumentId(comment, index)) ?? [];
      return [
        `## ${comment.user?.login ?? "unknown"} on ${comment.path ?? "unknown"}`,
        ...(typeof comment.line === "number" ? [`- Line: ${String(comment.line)}`] : []),
        ...(comment.created_at ? [`- Created: ${comment.created_at}`] : []),
        ...assetLinks.map((assetPath) => `- Local image asset: ${assetPath}`),
        ...(comment.diff_hunk ? ["", "```diff", comment.diff_hunk, "```"] : []),
        "",
        renderBody(comment.body ?? comment.body_text),
      ].join("\n");
    }),
  ].join("\n\n");
}

export function renderIssueCommentsSummaryMarkdown(
  context: GitHubPullRequestContextResponse,
  resolveAssetLinks?: (documentId: string) => ReadonlyArray<string>,
): string {
  return [
    "# Issue Comments",
    "",
    ...context.issueComments.map((comment, index) => {
      const assetLinks =
        resolveAssetLinks?.(pullRequestIssueCommentDocumentId(comment, index)) ?? [];
      return [
        `## ${comment.user?.login ?? "unknown"}`,
        ...(comment.created_at ? [`- Created: ${comment.created_at}`] : []),
        ...assetLinks.map((assetPath) => `- Local image asset: ${assetPath}`),
        "",
        renderBody(comment.body ?? comment.body_text),
      ].join("\n");
    }),
  ].join("\n\n");
}

export function renderCommitsSummaryMarkdown(context: GitHubPullRequestContextResponse): string {
  return [
    "# Commits",
    "",
    ...context.commits.map((commit) =>
      [
        `## ${shortSha(commit.sha)} ${commit.commit?.message?.split("\n")[0] ?? "Commit"}`,
        ...(commit.author?.login ? [`- Author: ${commit.author.login}`] : []),
        ...(commit.commit?.author?.date ? [`- Date: ${commit.commit.author.date}`] : []),
        "",
        renderBody(commit.commit?.message),
      ].join("\n"),
    ),
  ].join("\n\n");
}
