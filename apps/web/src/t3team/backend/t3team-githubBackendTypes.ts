import type {
  GitHubAssetDownloadRequest,
  GitHubDownloadedAsset,
} from "~/t3team/backend/t3team-githubAssetTypes";
import type {
  GitHubPullRequestContextRequest,
  GitHubPullRequestContextResponse,
} from "~/t3team/backend/t3team-githubTypes";

export type GitHubRepositoryCandidate = {
  readonly id: string;
  readonly nameWithOwner: string;
  readonly url: string;
  readonly host: string;
  readonly updatedAt?: string;
  readonly description?: string;
  readonly isPrivate?: boolean;
};

export type GitHubInboxItem = {
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
};

export type GitHubInboxDiscoverResponse = {
  readonly host: string;
  readonly account?: string;
  readonly repositories: ReadonlyArray<GitHubRepositoryCandidate>;
  readonly inboxItems: ReadonlyArray<GitHubInboxItem>;
  readonly suggestedRepositoryUrls: ReadonlyArray<string>;
  readonly inboxWarning?: string;
  /** When `repositories` was last fetched from GitHub (the server keeps the list between opens). */
  readonly repositoriesFetchedAt?: string;
  /** The stored list was stale and the server is refreshing it in the background. */
  readonly repositoriesRefreshing?: true;
};

export interface GitHubBackendApi {
  readonly discoverInbox: (input: {
    readonly host: string;
    readonly projectKey?: string;
    readonly projectTitle?: string;
    readonly linkedRepositoryUrls?: ReadonlyArray<string>;
    readonly discoveryMode?: "inbox" | "repositories";
    /** `"user"` only for an explicit refresh or open; omitted means an automatic background read. */
    readonly trigger?: "user" | "background";
    /** Ask GitHub for the repository list now instead of the server's stored one. */
    readonly refresh?: boolean;
  }) => Promise<GitHubInboxDiscoverResponse>;
  readonly getPullRequestContext: (
    input: GitHubPullRequestContextRequest,
  ) => Promise<GitHubPullRequestContextResponse>;
  readonly downloadAsset: (input: GitHubAssetDownloadRequest) => Promise<GitHubDownloadedAsset>;
}
