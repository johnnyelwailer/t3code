import type { T3WorkDirectoryBundleReference } from "~/t3work/t3work-contextDirectoryBundle";

export function buildGitHubPullRequestArtifactReferences(input: {
  overviewPath: string;
  descriptionPath: string;
  filesSummaryPath: string;
  reviewsSummaryPath: string;
  reviewCommentsSummaryPath: string;
  issueCommentsSummaryPath: string;
  commitsSummaryPath: string;
  snapshotsIndexPath: string;
  assetsIndexPath?: string;
  diffPath?: string;
}): ReadonlyArray<T3WorkDirectoryBundleReference> {
  return [
    { label: "PR overview", relativePath: input.overviewPath },
    { label: "PR description", relativePath: input.descriptionPath },
    { label: "Changed files summary", relativePath: input.filesSummaryPath },
    { label: "Reviews summary", relativePath: input.reviewsSummaryPath },
    { label: "Review comments summary", relativePath: input.reviewCommentsSummaryPath },
    { label: "Issue comments summary", relativePath: input.issueCommentsSummaryPath },
    { label: "Commits summary", relativePath: input.commitsSummaryPath },
    { label: "File snapshots index", relativePath: input.snapshotsIndexPath },
    ...(input.assetsIndexPath
      ? [{ label: "Remote assets index", relativePath: input.assetsIndexPath }]
      : []),
    ...(input.diffPath ? [{ label: "PR diff", relativePath: input.diffPath }] : []),
  ];
}

export function buildGitHubPullRequestArtifactPaths(input: {
  overviewPath: string;
  descriptionPath: string;
  descriptionHtmlPath: string;
  hasDescriptionHtml: boolean;
  diffPath: string;
  hasDiff: boolean;
  assetsIndexPath?: string;
  assetCount?: number;
  downloadedAssetCount?: number;
  failedAssetCount?: number;
  filesIndexPath: string;
  filesSummaryPath: string;
  reviewsIndexPath: string;
  reviewsSummaryPath: string;
  reviewCommentsIndexPath: string;
  reviewCommentsSummaryPath: string;
  issueCommentsIndexPath: string;
  issueCommentsSummaryPath: string;
  commitsIndexPath: string;
  commitsSummaryPath: string;
  snapshotsIndexPath: string;
  rawRoot: string;
}): Record<string, unknown> {
  return {
    overview: input.overviewPath,
    description: input.descriptionPath,
    ...(input.hasDescriptionHtml ? { descriptionHtml: input.descriptionHtmlPath } : {}),
    ...(input.hasDiff ? { diff: input.diffPath } : {}),
    ...(input.assetsIndexPath
      ? {
          assets: {
            index: input.assetsIndexPath,
            count: input.assetCount ?? 0,
            downloadedCount: input.downloadedAssetCount ?? 0,
            failedCount: input.failedAssetCount ?? 0,
          },
        }
      : {}),
    files: { index: input.filesIndexPath, summary: input.filesSummaryPath },
    reviews: { index: input.reviewsIndexPath, summary: input.reviewsSummaryPath },
    reviewComments: {
      index: input.reviewCommentsIndexPath,
      summary: input.reviewCommentsSummaryPath,
    },
    issueComments: { index: input.issueCommentsIndexPath, summary: input.issueCommentsSummaryPath },
    commits: { index: input.commitsIndexPath, summary: input.commitsSummaryPath },
    snapshots: { index: input.snapshotsIndexPath },
    raw: {
      pullRequest: `${input.rawRoot}/pull-request.json`,
      files: `${input.rawRoot}/files.json`,
      reviews: `${input.rawRoot}/reviews.json`,
      reviewComments: `${input.rawRoot}/review-comments.json`,
      issueComments: `${input.rawRoot}/issue-comments.json`,
      commits: `${input.rawRoot}/commits.json`,
    },
  };
}
