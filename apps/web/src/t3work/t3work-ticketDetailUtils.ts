import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";

export function parseTimestampMs(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveHtmlBaseUrl(ticketUrl: string | undefined): string | undefined {
  if (!ticketUrl) return undefined;
  try {
    return new URL(ticketUrl).origin;
  } catch {
    return undefined;
  }
}

export function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

export function sortCommentItems(
  comments: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return comments.toSorted(
    (a, b) =>
      parseTimestampMs(typeof b.updated === "string" ? b.updated : undefined) -
        parseTimestampMs(typeof a.updated === "string" ? a.updated : undefined) ||
      parseTimestampMs(typeof b.created === "string" ? b.created : undefined) -
        parseTimestampMs(typeof a.created === "string" ? a.created : undefined),
  );
}

export function buildGithubActivitySummary(
  matchedItems: ReadonlyArray<GitHubWorkActivityItem>,
): string | undefined {
  if (matchedItems.length === 0) return undefined;
  const lines = matchedItems.slice(0, 12).map((item) => {
    const parts = [
      item.subjectTitle ?? item.repository,
      `[${item.reason}]`,
      `repo:${item.repository}`,
    ];
    if (item.updatedAt) {
      parts.push(`updated:${item.updatedAt}`);
    }
    return `- ${parts.join(" ")}`;
  });
  if (matchedItems.length > 12) {
    lines.push(`- ... ${matchedItems.length - 12} more items`);
  }
  return lines.join("\n");
}
