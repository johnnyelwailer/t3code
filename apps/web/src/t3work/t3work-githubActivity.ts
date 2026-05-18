import type { SourceControlDiscoveryResult } from "@t3tools/contracts";
import type { GitHubInboxItem } from "~/t3work/backend/t3work-types";

export type GitHubWorkActivityItem = {
  readonly id: string;
  readonly repository: string;
  readonly repositoryUrl?: string;
  readonly reason: string;
  readonly authorLogin?: string;
  readonly reviewRequested?: boolean;
  readonly subjectType?: string;
  readonly subjectTitle?: string;
  readonly subjectUrl?: string;
  readonly subjectBranch?: string;
  readonly subjectState?: "open" | "closed" | "merged" | "draft";
  readonly updatedAt?: string;
  readonly workItemKey?: string;
};

export function parseOptionString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (!value || typeof value !== "object") return undefined;
  const tagged = value as { _tag?: unknown; value?: unknown };
  if (
    tagged._tag === "Some" &&
    typeof tagged.value === "string" &&
    tagged.value.trim().length > 0
  ) {
    return tagged.value.trim();
  }
  return undefined;
}

export function parseGitHubHostFromDiscovery(discovery: SourceControlDiscoveryResult): string {
  const github = discovery.sourceControlProviders.find((provider) => provider.kind === "github");
  if (!github) return "github.com";
  return parseOptionString(github.auth.host) ?? "github.com";
}

export function extractWorkItemKey(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const match = input.toUpperCase().match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  return match ? match[1] : undefined;
}

export function toGitHubWorkActivityItems(
  inboxItems: ReadonlyArray<GitHubInboxItem>,
): ReadonlyArray<GitHubWorkActivityItem> {
  return inboxItems.map((item) => {
    const workItemKey =
      extractWorkItemKey(item.subjectTitle) ??
      extractWorkItemKey(item.subjectBranch) ??
      extractWorkItemKey(item.repository) ??
      undefined;
    return {
      id: item.id,
      repository: item.repository,
      ...(item.repositoryUrl ? { repositoryUrl: item.repositoryUrl } : {}),
      reason: item.reason,
      ...(item.authorLogin ? { authorLogin: item.authorLogin } : {}),
      ...(typeof item.reviewRequested === "boolean"
        ? { reviewRequested: item.reviewRequested }
        : {}),
      ...(item.subjectType ? { subjectType: item.subjectType } : {}),
      ...(item.subjectTitle ? { subjectTitle: item.subjectTitle } : {}),
      ...(item.subjectUrl ? { subjectUrl: item.subjectUrl } : {}),
      ...(item.subjectBranch ? { subjectBranch: item.subjectBranch } : {}),
      ...(item.subjectState ? { subjectState: item.subjectState } : {}),
      ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
      ...(workItemKey ? { workItemKey } : {}),
    } satisfies GitHubWorkActivityItem;
  });
}

export function groupGitHubActivityByWorkItem(
  items: ReadonlyArray<GitHubWorkActivityItem>,
): ReadonlyMap<string, ReadonlyArray<GitHubWorkActivityItem>> {
  const map = new Map<string, GitHubWorkActivityItem[]>();
  for (const item of items) {
    if (!item.workItemKey) continue;
    const existing = map.get(item.workItemKey) ?? [];
    existing.push(item);
    map.set(item.workItemKey, existing);
  }
  return map;
}
