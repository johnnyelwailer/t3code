import type { SourceControlDiscoveryResult } from "@t3tools/contracts";
import {
  resolveGitHubWorkItemKey,
  sortGitHubActivityItems,
} from "@t3tools/shared/t3team-githubActivity";
import type { GitHubInboxItem } from "~/t3team/backend/t3team-types";

/**
 * Work-item ↔ GitHub association, sorting, and grouping used to be implemented in this file only,
 * which meant the association ran exclusively in the browser: nothing server-side (a headless
 * orchestration run, a scheduled job, an agent with no UI) could resolve "which PRs belong to this
 * work item." That logic now lives in `@t3tools/shared/t3team-githubActivity` so
 * `apps/server/src/t3team-github-routes-linked-prs.ts` can stamp the same `workItemKey` onto items
 * before they ever reach a browser. The re-exports below keep this module's public surface
 * unchanged for its many existing importers.
 */
export {
  extractWorkItemKey,
  groupGitHubActivityByWorkItem,
  getGitHubActivityItemsForWorkItem,
} from "@t3tools/shared/t3team-githubActivity";

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

export function toGitHubWorkActivityItems(
  inboxItems: ReadonlyArray<GitHubInboxItem>,
): ReadonlyArray<GitHubWorkActivityItem> {
  return sortGitHubActivityItems(
    inboxItems.map((item) => {
      const workItemKey = resolveGitHubWorkItemKey(item);
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
