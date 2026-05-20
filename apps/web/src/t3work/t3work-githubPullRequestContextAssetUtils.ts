import type { T3WorkDirectoryBundleFile } from "~/t3work/t3work-contextDirectoryBundle";
import { buildRelativePath } from "~/t3work/t3work-githubPullRequestContextAssetPaths";
import type { GitHubPullRequestRichTextDocument } from "~/t3work/t3work-githubPullRequestContextDocuments";

export { buildGitHubRemoteAssetRelativePath } from "~/t3work/t3work-githubPullRequestContextAssetPaths";

const HTML_IMAGE_REGEX = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
const PLAIN_URL_REGEX = /https?:\/\/[^\s<>"')]+/gi;

export type GitHubPullRequestRemoteAssetEntry = {
  readonly sourceUrl: string;
  readonly referencedDocumentIds: ReadonlyArray<string>;
  readonly referencedDocuments: ReadonlyArray<string>;
  readonly status: "downloaded" | "failed";
  readonly localRelativePath?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
  readonly error?: string;
};

export type GitHubPullRequestRemoteAssetBundle = {
  readonly files: ReadonlyArray<T3WorkDirectoryBundleFile>;
  readonly indexRelativePath?: string;
  readonly assetCount: number;
  readonly downloadedCount: number;
  readonly failedCount: number;
  readonly warnings: ReadonlyArray<string>;
  readonly assetEntries: ReadonlyArray<GitHubPullRequestRemoteAssetEntry>;
  readonly localRelativePathBySourceUrl: ReadonlyMap<string, string>;
};

function resolveUrlAgainstBase(value: string, baseUrl?: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function looksLikePlainImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:$|[?#])/i.test(url.pathname) ||
      url.host === "githubusercontent.com" ||
      url.host.endsWith(".githubusercontent.com")
    );
  } catch {
    return false;
  }
}

function collectImageUrls(
  value: string | null | undefined,
  baseUrl: string | undefined,
  regex: RegExp,
  predicate?: (value: string) => boolean,
): ReadonlyArray<string> {
  if (!value) return [];
  const urls = new Set<string>();
  for (const match of value.matchAll(regex)) {
    const rawUrl = typeof match[1] === "string" ? match[1] : match[0];
    const resolved = resolveUrlAgainstBase(rawUrl, baseUrl);
    if (!resolved || (predicate && !predicate(resolved))) continue;
    urls.add(resolved);
  }
  return [...urls.values()];
}

export function collectGitHubPullRequestDocumentImageUrls(
  document: GitHubPullRequestRichTextDocument,
): ReadonlyArray<string> {
  return [
    ...new Set<string>([
      ...collectImageUrls(document.html, document.baseUrl, HTML_IMAGE_REGEX),
      ...collectImageUrls(document.markdown, document.baseUrl, MARKDOWN_IMAGE_REGEX),
      ...collectImageUrls(
        document.markdown,
        document.baseUrl,
        PLAIN_URL_REGEX,
        looksLikePlainImageUrl,
      ),
    ]),
  ];
}

function rewriteRemoteAssetUrls(input: {
  bundle: GitHubPullRequestRemoteAssetBundle;
  value: string;
  fromRelativePath: string;
  baseUrl?: string | undefined;
  regex: RegExp;
}): string {
  return input.value.replace(input.regex, (...args) => {
    const match = args[0];
    const rawUrl = typeof args[1] === "string" ? args[1] : match;
    const sourceUrl = resolveUrlAgainstBase(rawUrl, input.baseUrl);
    if (!sourceUrl) return match;
    const localRelativePath = input.bundle.localRelativePathBySourceUrl.get(sourceUrl);
    return localRelativePath
      ? match.replace(rawUrl, buildRelativePath(input.fromRelativePath, localRelativePath))
      : match;
  });
}

export function rewriteGitHubRemoteAssetMarkdown(input: {
  bundle: GitHubPullRequestRemoteAssetBundle;
  value: string | null | undefined;
  fromRelativePath: string;
  baseUrl?: string | undefined;
}): string {
  const nextValue = rewriteRemoteAssetUrls({
    bundle: input.bundle,
    value: input.value ?? "",
    fromRelativePath: input.fromRelativePath,
    baseUrl: input.baseUrl,
    regex: MARKDOWN_IMAGE_REGEX,
  });
  return rewriteRemoteAssetUrls({
    bundle: input.bundle,
    value: nextValue,
    fromRelativePath: input.fromRelativePath,
    baseUrl: input.baseUrl,
    regex: HTML_IMAGE_REGEX,
  }).replace(PLAIN_URL_REGEX, (match) => {
    if (!looksLikePlainImageUrl(match)) return match;
    const sourceUrl = resolveUrlAgainstBase(match, input.baseUrl);
    if (!sourceUrl) return match;
    const localRelativePath = input.bundle.localRelativePathBySourceUrl.get(sourceUrl);
    return localRelativePath ? buildRelativePath(input.fromRelativePath, localRelativePath) : match;
  });
}

export function rewriteGitHubRemoteAssetHtml(input: {
  bundle: GitHubPullRequestRemoteAssetBundle;
  value: string | null | undefined;
  fromRelativePath: string;
  baseUrl?: string | undefined;
}): string | undefined {
  const value = input.value?.trim();
  return value
    ? rewriteRemoteAssetUrls({
        bundle: input.bundle,
        value,
        fromRelativePath: input.fromRelativePath,
        baseUrl: input.baseUrl,
        regex: HTML_IMAGE_REGEX,
      })
    : undefined;
}

export function getGitHubPullRequestRemoteAssetLinks(
  bundle: GitHubPullRequestRemoteAssetBundle,
  documentId: string,
  fromRelativePath: string,
): ReadonlyArray<string> {
  return bundle.assetEntries.flatMap((entry) =>
    entry.status === "downloaded" &&
    entry.localRelativePath &&
    entry.referencedDocumentIds.includes(documentId)
      ? [buildRelativePath(fromRelativePath, entry.localRelativePath)]
      : [],
  );
}
