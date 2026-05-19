import type { SourceControlDiscoveryResult } from "@t3tools/contracts";
import type { GitHubInboxItem } from "~/t3work/backend/t3work-types";

export type GitHubWorkActivityItem = {
  readonly id: string;
  readonly repository: string;
  readonly repositoryUrl?: string;
  readonly reason: string;
  readonly authorLogin?: string;
  readonly authorAvatarUrl?: string;
  readonly reviewRequested?: boolean;
  readonly subjectType?: string;
  readonly subjectTitle?: string;
  readonly subjectUrl?: string;
  readonly subjectBranch?: string;
  readonly subjectState?: "open" | "closed" | "merged" | "draft";
  readonly commentCount?: number;
  readonly reviewCommentCount?: number;
  readonly additions?: number;
  readonly deletions?: number;
  readonly changedFiles?: number;
  readonly updatedAt?: string;
  readonly workItemKey?: string;
};

function isPullRequestActivity(item: GitHubWorkActivityItem): boolean {
  return (item.subjectType ?? "").trim().toLowerCase() === "pullrequest";
}

function isUnmergedPullRequestActivity(item: GitHubWorkActivityItem): boolean {
  if (!isPullRequestActivity(item)) return false;
  const state = item.subjectState;
  return state === "open" || state === "draft" || state === undefined;
}

function sortGitHubActivityItems(
  items: ReadonlyArray<GitHubWorkActivityItem>,
): ReadonlyArray<GitHubWorkActivityItem> {
  return [...items].sort((left, right) => {
    const leftIsUnmergedPr = isUnmergedPullRequestActivity(left);
    const rightIsUnmergedPr = isUnmergedPullRequestActivity(right);
    if (leftIsUnmergedPr !== rightIsUnmergedPr) {
      return leftIsUnmergedPr ? -1 : 1;
    }

    const leftReviewRequested = left.reviewRequested === true;
    const rightReviewRequested = right.reviewRequested === true;
    if (leftReviewRequested !== rightReviewRequested) {
      return leftReviewRequested ? -1 : 1;
    }

    const leftUpdatedAt = left.updatedAt ? Date.parse(left.updatedAt) : Number.NaN;
    const rightUpdatedAt = right.updatedAt ? Date.parse(right.updatedAt) : Number.NaN;
    const leftUpdatedAtSafe = Number.isFinite(leftUpdatedAt) ? leftUpdatedAt : 0;
    const rightUpdatedAtSafe = Number.isFinite(rightUpdatedAt) ? rightUpdatedAt : 0;
    if (leftUpdatedAtSafe !== rightUpdatedAtSafe) {
      return rightUpdatedAtSafe - leftUpdatedAtSafe;
    }

    return left.id.localeCompare(right.id);
  });
}

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
  return sortGitHubActivityItems(
    inboxItems.map((item) => {
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
        ...(item.authorAvatarUrl ? { authorAvatarUrl: item.authorAvatarUrl } : {}),
        ...(typeof item.reviewRequested === "boolean"
          ? { reviewRequested: item.reviewRequested }
          : {}),
        ...(item.subjectType ? { subjectType: item.subjectType } : {}),
        ...(item.subjectTitle ? { subjectTitle: item.subjectTitle } : {}),
        ...(item.subjectUrl ? { subjectUrl: item.subjectUrl } : {}),
        ...(item.subjectBranch ? { subjectBranch: item.subjectBranch } : {}),
        ...(item.subjectState ? { subjectState: item.subjectState } : {}),
        ...(typeof item.commentCount === "number" ? { commentCount: item.commentCount } : {}),
        ...(typeof item.reviewCommentCount === "number"
          ? { reviewCommentCount: item.reviewCommentCount }
          : {}),
        ...(typeof item.additions === "number" ? { additions: item.additions } : {}),
        ...(typeof item.deletions === "number" ? { deletions: item.deletions } : {}),
        ...(typeof item.changedFiles === "number" ? { changedFiles: item.changedFiles } : {}),
        ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
        ...(workItemKey ? { workItemKey } : {}),
      } satisfies GitHubWorkActivityItem;
    }),
  );
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
  for (const [workItemKey, groupedItems] of map) {
    map.set(workItemKey, [...sortGitHubActivityItems(groupedItems)]);
  }
  return map;
}
