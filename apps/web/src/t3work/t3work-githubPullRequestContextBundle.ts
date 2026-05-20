import type { GitHubPullRequestContextResponse } from "~/t3work/backend/t3work-githubTypes";
import type {
  T3WorkDirectoryBundleFile,
  T3WorkDirectoryBundleReference,
} from "~/t3work/t3work-contextDirectoryBundle";
import { compactJson } from "~/t3work/t3work-contextDirectoryBundle";
import {
  buildGitHubPullRequestPatchArtifacts,
  buildGitHubPullRequestSnapshotArtifacts,
} from "~/t3work/t3work-githubPullRequestContextBundleParts";
import {
  buildGitHubPullRequestArtifactPaths,
  buildGitHubPullRequestArtifactReferences,
} from "~/t3work/t3work-githubPullRequestContextBundleMetadata";
import { type GitHubPullRequestRemoteAssetBundle } from "~/t3work/t3work-githubPullRequestContextAssets";
import {
  buildGitHubPullRequestDescriptionContent,
  renderGitHubPullRequestIssueCommentsSummary,
  renderGitHubPullRequestReviewCommentsSummary,
  renderGitHubPullRequestReviewsSummary,
} from "~/t3work/t3work-githubPullRequestContextBundleRender";
import {
  renderCommitsSummaryMarkdown,
  renderFilesSummaryMarkdown,
  renderOverviewMarkdown,
} from "~/t3work/t3work-githubPullRequestContextRender";

export type GitHubPullRequestArtifactBundle = {
  files: ReadonlyArray<T3WorkDirectoryBundleFile>;
  fileReferences: ReadonlyArray<T3WorkDirectoryBundleReference>;
  paths: Record<string, unknown>;
};

export function buildGitHubPullRequestArtifactBundle(input: {
  root: string;
  context: GitHubPullRequestContextResponse;
  remoteAssets?: GitHubPullRequestRemoteAssetBundle;
}): GitHubPullRequestArtifactBundle {
  const files: T3WorkDirectoryBundleFile[] = [];
  const pushText = (relativePath: string, contents: string) => {
    files.push({ relativePath, contents });
  };
  const pushJson = (relativePath: string, value: unknown) => {
    files.push({ relativePath, contents: compactJson(value) });
  };

  const overviewPath = `${input.root}/pull-request/overview.md`;
  const descriptionPath = `${input.root}/pull-request/description.md`;
  const descriptionHtmlPath = `${input.root}/pull-request/description.html`;
  const diffPath = `${input.root}/pull-request/diff.diff`;
  const filesIndexPath = `${input.root}/pull-request/files/index.json`;
  const filesSummaryPath = `${input.root}/pull-request/files/summary.md`;
  const reviewsIndexPath = `${input.root}/pull-request/reviews/index.json`;
  const reviewsSummaryPath = `${input.root}/pull-request/reviews/summary.md`;
  const reviewCommentsIndexPath = `${input.root}/pull-request/comments/review-comments.json`;
  const reviewCommentsSummaryPath = `${input.root}/pull-request/comments/review-comments.md`;
  const issueCommentsIndexPath = `${input.root}/pull-request/comments/issue-comments.json`;
  const issueCommentsSummaryPath = `${input.root}/pull-request/comments/issue-comments.md`;
  const commitsIndexPath = `${input.root}/pull-request/commits/index.json`;
  const commitsSummaryPath = `${input.root}/pull-request/commits/summary.md`;
  const snapshotsIndexPath = `${input.root}/pull-request/snapshots/index.json`;
  const assetsIndexPath = input.remoteAssets?.indexRelativePath;
  const rawRoot = `${input.root}/pull-request/raw`;

  const snapshotArtifacts = buildGitHubPullRequestSnapshotArtifacts({
    root: input.root,
    fileSnapshots: input.context.fileSnapshots,
  });
  files.push(...snapshotArtifacts.files);

  const patchArtifacts = buildGitHubPullRequestPatchArtifacts({
    root: input.root,
    files: input.context.files,
  });
  files.push(...patchArtifacts.files);

  pushText(
    overviewPath,
    renderOverviewMarkdown({
      context: input.context,
      descriptionPath,
      diffPath,
      filesSummaryPath,
      reviewsSummaryPath,
      reviewCommentsSummaryPath,
      issueCommentsSummaryPath,
      commitsSummaryPath,
      snapshotsIndexPath,
      ...(assetsIndexPath ? { assetsIndexPath } : {}),
      ...(typeof input.remoteAssets?.assetCount === "number"
        ? {
            assetCount: input.remoteAssets.assetCount,
            downloadedAssetCount: input.remoteAssets.downloadedCount,
            failedAssetCount: input.remoteAssets.failedCount,
          }
        : {}),
      warnings: [...(input.context.warnings ?? []), ...(input.remoteAssets?.warnings ?? [])],
    }),
  );

  const { descriptionMarkdown, descriptionHtml } = buildGitHubPullRequestDescriptionContent({
    context: input.context,
    ...(input.remoteAssets ? { remoteAssets: input.remoteAssets } : {}),
    descriptionPath,
    descriptionHtmlPath,
  });
  pushText(descriptionPath, descriptionMarkdown);
  if (descriptionHtml) {
    pushText(descriptionHtmlPath, descriptionHtml);
  }
  if (input.context.diff) {
    pushText(diffPath, input.context.diff);
  }

  pushJson(`${rawRoot}/pull-request.json`, input.context.pullRequest);
  pushJson(`${rawRoot}/files.json`, input.context.files);
  pushJson(`${rawRoot}/reviews.json`, input.context.reviews);
  pushJson(`${rawRoot}/review-comments.json`, input.context.reviewComments);
  pushJson(`${rawRoot}/issue-comments.json`, input.context.issueComments);
  pushJson(`${rawRoot}/commits.json`, input.context.commits);

  pushJson(filesIndexPath, input.context.files);
  pushText(
    filesSummaryPath,
    renderFilesSummaryMarkdown({
      context: input.context,
      patchPathByFilename: patchArtifacts.patchPathByFilename,
    }),
  );

  pushJson(reviewsIndexPath, input.context.reviews);
  pushText(
    reviewsSummaryPath,
    renderGitHubPullRequestReviewsSummary({
      context: input.context,
      ...(input.remoteAssets ? { remoteAssets: input.remoteAssets } : {}),
      summaryPath: reviewsSummaryPath,
    }),
  );

  pushJson(reviewCommentsIndexPath, input.context.reviewComments);
  pushText(
    reviewCommentsSummaryPath,
    renderGitHubPullRequestReviewCommentsSummary({
      context: input.context,
      ...(input.remoteAssets ? { remoteAssets: input.remoteAssets } : {}),
      summaryPath: reviewCommentsSummaryPath,
    }),
  );

  pushJson(issueCommentsIndexPath, input.context.issueComments);
  pushText(
    issueCommentsSummaryPath,
    renderGitHubPullRequestIssueCommentsSummary({
      context: input.context,
      ...(input.remoteAssets ? { remoteAssets: input.remoteAssets } : {}),
      summaryPath: issueCommentsSummaryPath,
    }),
  );

  pushJson(commitsIndexPath, input.context.commits);
  pushText(commitsSummaryPath, renderCommitsSummaryMarkdown(input.context));

  pushJson(snapshotsIndexPath, snapshotArtifacts.snapshotIndex);

  if (input.remoteAssets) {
    files.push(...input.remoteAssets.files);
  }
  const fileReferences = buildGitHubPullRequestArtifactReferences({
    overviewPath,
    descriptionPath,
    filesSummaryPath,
    reviewsSummaryPath,
    reviewCommentsSummaryPath,
    issueCommentsSummaryPath,
    commitsSummaryPath,
    snapshotsIndexPath,
    ...(assetsIndexPath ? { assetsIndexPath } : {}),
    ...(input.context.diff ? { diffPath } : {}),
  });

  return {
    files,
    fileReferences,
    paths: buildGitHubPullRequestArtifactPaths({
      overviewPath,
      descriptionPath,
      descriptionHtmlPath,
      hasDescriptionHtml: Boolean(descriptionHtml),
      diffPath,
      hasDiff: Boolean(input.context.diff),
      ...(assetsIndexPath ? { assetsIndexPath } : {}),
      ...(typeof input.remoteAssets?.assetCount === "number"
        ? { assetCount: input.remoteAssets.assetCount }
        : {}),
      ...(typeof input.remoteAssets?.downloadedCount === "number"
        ? { downloadedAssetCount: input.remoteAssets.downloadedCount }
        : {}),
      ...(typeof input.remoteAssets?.failedCount === "number"
        ? { failedAssetCount: input.remoteAssets.failedCount }
        : {}),
      filesIndexPath,
      filesSummaryPath,
      reviewsIndexPath,
      reviewsSummaryPath,
      reviewCommentsIndexPath,
      reviewCommentsSummaryPath,
      issueCommentsIndexPath,
      issueCommentsSummaryPath,
      commitsIndexPath,
      commitsSummaryPath,
      snapshotsIndexPath,
      rawRoot,
    }),
  };
}
