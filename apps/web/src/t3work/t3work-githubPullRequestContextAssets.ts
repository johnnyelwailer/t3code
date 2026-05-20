import type { GitHubPullRequestContextResponse } from "~/t3work/backend/t3work-githubTypes";
import type { BackendApi } from "~/t3work/backend/t3work-types";
import type { AddToChatPayloadProgressUpdate } from "~/t3work/t3work-addToChatUtils";
import {
  compactJson,
  type T3WorkDirectoryBundleFile,
} from "~/t3work/t3work-contextDirectoryBundle";
import { collectGitHubPullRequestRichTextDocuments } from "~/t3work/t3work-githubPullRequestContextDocuments";
import {
  buildGitHubRemoteAssetRelativePath,
  collectGitHubPullRequestDocumentImageUrls,
  type GitHubPullRequestRemoteAssetBundle,
  type GitHubPullRequestRemoteAssetEntry,
} from "~/t3work/t3work-githubPullRequestContextAssetUtils";

export {
  getGitHubPullRequestRemoteAssetLinks,
  rewriteGitHubRemoteAssetHtml,
  rewriteGitHubRemoteAssetMarkdown,
} from "~/t3work/t3work-githubPullRequestContextAssetUtils";
export type { GitHubPullRequestRemoteAssetBundle } from "~/t3work/t3work-githubPullRequestContextAssetUtils";

function errorMessageFromCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Unable to download GitHub asset.";
}

export async function buildGitHubPullRequestRemoteAssetBundle(input: {
  backend: Pick<BackendApi, "github">;
  root: string;
  context: GitHubPullRequestContextResponse;
  onProgress?: ((update: AddToChatPayloadProgressUpdate) => void) | undefined;
}): Promise<GitHubPullRequestRemoteAssetBundle> {
  const documents = collectGitHubPullRequestRichTextDocuments(input.context);
  const plans = new Map<
    string,
    { sourceUrl: string; documentIds: Set<string>; documentLabels: Set<string> }
  >();

  for (const document of documents) {
    for (const sourceUrl of collectGitHubPullRequestDocumentImageUrls(document)) {
      const existing = plans.get(sourceUrl) ?? {
        sourceUrl,
        documentIds: new Set<string>(),
        documentLabels: new Set<string>(),
      };
      existing.documentIds.add(document.id);
      existing.documentLabels.add(document.label);
      plans.set(sourceUrl, existing);
    }
  }

  if (plans.size === 0) {
    return {
      files: [],
      assetCount: 0,
      downloadedCount: 0,
      failedCount: 0,
      warnings: [],
      assetEntries: [],
      localRelativePathBySourceUrl: new Map<string, string>(),
    };
  }

  const indexRelativePath = `${input.root}/pull-request/assets/index.json`;
  const files: T3WorkDirectoryBundleFile[] = [];
  const localRelativePathBySourceUrl = new Map<string, string>();
  const assetEntries: GitHubPullRequestRemoteAssetEntry[] = [];

  for (const [index, plan] of [...plans.values()].entries()) {
    input.onProgress?.({
      phase: "Downloading GitHub pull request images",
      progressCurrent: index,
      progressTotal: plans.size,
      syncInfo: {
        contentLabel: "GitHub pull request package",
        currentItemLabel: new URL(plan.sourceUrl).pathname.split("/").pop() ?? plan.sourceUrl,
        currentItemDetail: plan.sourceUrl,
      },
    });
    try {
      const asset = await input.backend.github.downloadAsset({
        host: input.context.host,
        url: plan.sourceUrl,
      });
      const localRelativePath = buildGitHubRemoteAssetRelativePath(
        input.root,
        plan.sourceUrl,
        asset.mimeType,
        index,
      );
      files.push({
        relativePath: localRelativePath,
        contents: asset.base64Contents,
        encoding: "base64",
        sizeBytes: asset.sizeBytes,
      });
      localRelativePathBySourceUrl.set(plan.sourceUrl, localRelativePath);
      assetEntries.push({
        sourceUrl: plan.sourceUrl,
        referencedDocumentIds: [...plan.documentIds.values()],
        referencedDocuments: [...plan.documentLabels.values()],
        status: "downloaded",
        localRelativePath,
        ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
        sizeBytes: asset.sizeBytes,
      });
    } catch (cause) {
      assetEntries.push({
        sourceUrl: plan.sourceUrl,
        referencedDocumentIds: [...plan.documentIds.values()],
        referencedDocuments: [...plan.documentLabels.values()],
        status: "failed",
        error: errorMessageFromCause(cause),
      });
    }
  }

  const downloadedCount = assetEntries.filter((entry) => entry.status === "downloaded").length;
  const failedCount = assetEntries.length - downloadedCount;
  const warnings = assetEntries
    .filter((entry) => entry.status === "failed")
    .map((entry) => `Unable to download remote image ${entry.sourceUrl}.`);

  files.push({
    relativePath: indexRelativePath,
    contents: compactJson({
      kind: "github-pull-request-remote-assets",
      host: input.context.host,
      repository: input.context.repository,
      pullRequestNumber: input.context.pullRequestNumber,
      assetCount: assetEntries.length,
      downloadedCount,
      failedCount,
      assets: assetEntries,
    }),
  });

  input.onProgress?.({
    phase: "Downloading GitHub pull request images",
    progressCurrent: assetEntries.length,
    progressTotal: assetEntries.length,
    syncInfo: {
      contentLabel: "GitHub pull request package",
      currentItemLabel: `${String(downloadedCount)} of ${String(assetEntries.length)} images bundled`,
    },
  });

  return {
    files,
    indexRelativePath,
    assetCount: assetEntries.length,
    downloadedCount,
    failedCount,
    warnings,
    assetEntries,
    localRelativePathBySourceUrl,
  };
}
