import type { GitHubPullRequestContextResponse } from "~/t3work/backend/t3work-githubTypes";
import {
  getGitHubPullRequestRemoteAssetLinks,
  rewriteGitHubRemoteAssetHtml,
  rewriteGitHubRemoteAssetMarkdown,
  type GitHubPullRequestRemoteAssetBundle,
} from "~/t3work/t3work-githubPullRequestContextAssetUtils";
import {
  renderBody,
  renderIssueCommentsSummaryMarkdown,
  renderReviewCommentsSummaryMarkdown,
  renderReviewsSummaryMarkdown,
} from "~/t3work/t3work-githubPullRequestContextRender";

export function buildGitHubPullRequestDescriptionContent(input: {
  context: GitHubPullRequestContextResponse;
  remoteAssets?: GitHubPullRequestRemoteAssetBundle;
  descriptionPath: string;
  descriptionHtmlPath: string;
}): { descriptionMarkdown: string; descriptionHtml?: string } {
  const descriptionMarkdown = input.remoteAssets
    ? rewriteGitHubRemoteAssetMarkdown({
        bundle: input.remoteAssets,
        value: input.context.pullRequest.body ?? input.context.pullRequest.body_text,
        fromRelativePath: input.descriptionPath,
        baseUrl: input.context.pullRequest.html_url,
      })
    : (input.context.pullRequest.body ?? input.context.pullRequest.body_text ?? "");
  const descriptionHtml = input.remoteAssets
    ? rewriteGitHubRemoteAssetHtml({
        bundle: input.remoteAssets,
        value: input.context.pullRequest.body_html,
        fromRelativePath: input.descriptionHtmlPath,
        baseUrl: input.context.pullRequest.html_url,
      })
    : input.context.pullRequest.body_html?.trim();
  return {
    descriptionMarkdown: renderBody(descriptionMarkdown),
    ...(descriptionHtml ? { descriptionHtml } : {}),
  };
}

function resolveRemoteAssetLinks(
  remoteAssets: GitHubPullRequestRemoteAssetBundle | undefined,
  fromRelativePath: string,
): ((documentId: string) => ReadonlyArray<string>) | undefined {
  return remoteAssets
    ? (documentId) =>
        getGitHubPullRequestRemoteAssetLinks(remoteAssets, documentId, fromRelativePath)
    : undefined;
}

export function renderGitHubPullRequestReviewsSummary(input: {
  context: GitHubPullRequestContextResponse;
  remoteAssets?: GitHubPullRequestRemoteAssetBundle;
  summaryPath: string;
}): string {
  return renderReviewsSummaryMarkdown(
    input.context,
    resolveRemoteAssetLinks(input.remoteAssets, input.summaryPath),
  );
}

export function renderGitHubPullRequestReviewCommentsSummary(input: {
  context: GitHubPullRequestContextResponse;
  remoteAssets?: GitHubPullRequestRemoteAssetBundle;
  summaryPath: string;
}): string {
  return renderReviewCommentsSummaryMarkdown(
    input.context,
    resolveRemoteAssetLinks(input.remoteAssets, input.summaryPath),
  );
}

export function renderGitHubPullRequestIssueCommentsSummary(input: {
  context: GitHubPullRequestContextResponse;
  remoteAssets?: GitHubPullRequestRemoteAssetBundle;
  summaryPath: string;
}): string {
  return renderIssueCommentsSummaryMarkdown(
    input.context,
    resolveRemoteAssetLinks(input.remoteAssets, input.summaryPath),
  );
}
