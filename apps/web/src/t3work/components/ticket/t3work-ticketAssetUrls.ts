import type { JiraAttachment } from "./t3work-ticketRichContentTypes";
import { buildTicketAttachmentCacheRelativePath } from "~/t3work/t3work-ticketAttachmentUtils";
import { buildAtlassianAssetContentUrl } from "~/t3work/t3work-atlassianAssetUrls";

function resolveUrlAgainstBase(url: string, baseUrl?: string): string {
  const trimmed = url.trim();
  if (!trimmed || !baseUrl) return trimmed;

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

function addRewrite(
  rewrites: Map<string, string>,
  sourceUrl: string | undefined,
  localAssetUrl: string,
  baseUrl?: string,
): void {
  const trimmed = sourceUrl?.trim() ?? "";
  if (!trimmed) return;
  rewrites.set(trimmed, localAssetUrl);
  const resolvedUrl = resolveUrlAgainstBase(trimmed, baseUrl);
  if (resolvedUrl) {
    rewrites.set(resolvedUrl, localAssetUrl);
  }
}

function readUrlPathname(url: string, baseUrl?: string): string | undefined {
  try {
    return new URL(url, baseUrl).pathname;
  } catch {
    return undefined;
  }
}

function isLikelyAttachmentImageUrl(url: string, attachment: JiraAttachment, baseUrl?: string) {
  const pathname = readUrlPathname(url, baseUrl);
  if (!pathname) return false;
  let decodedPath = pathname.toLowerCase();
  try {
    decodedPath = decodeURIComponent(pathname).toLowerCase();
  } catch {
    decodedPath = pathname.toLowerCase();
  }
  const id = attachment.id?.trim().toLowerCase() ?? "";
  const filename = attachment.filename?.trim().toLowerCase() ?? "";
  return (
    (id.length > 0 && decodedPath.includes(`/attachment/${id}/`)) ||
    (id.length > 0 && decodedPath.endsWith(`/attachment/${id}`)) ||
    (id.length > 0 && decodedPath.includes(`/attachment/content/${id}`)) ||
    (id.length > 0 && decodedPath.includes(`/attachment/thumbnail/${id}`)) ||
    (filename.length > 0 && decodedPath.endsWith(`/${filename}`))
  );
}

export function createJiraTicketAssetUrlResolver(input: {
  projectId: string;
  ticketKey: string;
  accountId?: string;
  httpBaseUrl?: string;
  workspaceRoot?: string;
  baseUrl?: string;
  attachments: JiraAttachment[];
}): ((url: string) => string) | undefined {
  if (!input.accountId) {
    return undefined;
  }

  const rewrites = new Map<string, string>();
  for (const attachment of input.attachments) {
    const sourceUrl = attachment.content?.trim() ?? "";
    const thumbnailUrl = attachment.thumbnail?.trim() ?? "";
    const fallbackUrl = sourceUrl || thumbnailUrl;
    if (!fallbackUrl) {
      continue;
    }

    const resolvedFallbackUrl = resolveUrlAgainstBase(fallbackUrl, input.baseUrl);
    if (!resolvedFallbackUrl) {
      continue;
    }

    const relativePath = buildTicketAttachmentCacheRelativePath({
      projectId: input.projectId,
      ticketKey: input.ticketKey,
      attachment,
    });
    const localAssetUrl = buildAtlassianAssetContentUrl({
      accountId: input.accountId,
      url: resolvedFallbackUrl,
      ...(input.httpBaseUrl ? { httpBaseUrl: input.httpBaseUrl } : {}),
      ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
      relativePath,
    });

    addRewrite(rewrites, sourceUrl, localAssetUrl, input.baseUrl);
    addRewrite(rewrites, resolvedFallbackUrl, localAssetUrl, input.baseUrl);
    addRewrite(rewrites, thumbnailUrl, localAssetUrl, input.baseUrl);
  }

  if (rewrites.size === 0) {
    return undefined;
  }

  return (url: string) => {
    const trimmed = url.trim();
    const exact = rewrites.get(trimmed);
    if (exact) return exact;

    const attachment = input.attachments.find((candidate) =>
      isLikelyAttachmentImageUrl(trimmed, candidate, input.baseUrl),
    );
    if (!attachment) return url;

    const fallbackUrl = attachment.content?.trim() || attachment.thumbnail?.trim();
    if (!fallbackUrl) return url;
    const resolvedFallbackUrl = resolveUrlAgainstBase(fallbackUrl, input.baseUrl);
    return rewrites.get(resolvedFallbackUrl) ?? rewrites.get(fallbackUrl) ?? url;
  };
}
