export type GitHubPullRequestContextRequest = {
  readonly host: string;
  readonly repository: string;
  readonly subjectUrl?: string;
  readonly itemId?: string;
};

export type GitHubPullRequestContextAuthor = {
  readonly login?: string;
  readonly avatar_url?: string;
  readonly html_url?: string;
};

export type GitHubPullRequestContextRef = {
  readonly ref?: string;
  readonly sha?: string;
  readonly repo?: {
    readonly full_name?: string;
    readonly html_url?: string;
  };
};

export type GitHubPullRequestContextDetails = {
  readonly id?: number;
  readonly number?: number;
  readonly title?: string;
  readonly state?: string;
  readonly draft?: boolean;
  readonly merged_at?: string | null;
  readonly html_url?: string;
  readonly body?: string | null;
  readonly body_text?: string | null;
  readonly body_html?: string | null;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly comments?: number;
  readonly review_comments?: number;
  readonly additions?: number;
  readonly deletions?: number;
  readonly changed_files?: number;
  readonly commits?: number;
  readonly user?: GitHubPullRequestContextAuthor;
  readonly base?: GitHubPullRequestContextRef;
  readonly head?: GitHubPullRequestContextRef;
};

export type GitHubPullRequestContextFile = {
  readonly sha?: string;
  readonly filename?: string;
  readonly status?: string;
  readonly additions?: number;
  readonly deletions?: number;
  readonly changes?: number;
  readonly blob_url?: string;
  readonly raw_url?: string;
  readonly contents_url?: string;
  readonly patch?: string;
  readonly previous_filename?: string;
};

export type GitHubPullRequestContextReview = {
  readonly id?: number;
  readonly user?: GitHubPullRequestContextAuthor;
  readonly body?: string | null;
  readonly body_text?: string | null;
  readonly body_html?: string | null;
  readonly state?: string;
  readonly submitted_at?: string;
  readonly commit_id?: string;
  readonly html_url?: string;
};

export type GitHubPullRequestContextReviewComment = {
  readonly id?: number;
  readonly user?: GitHubPullRequestContextAuthor;
  readonly body?: string | null;
  readonly body_text?: string | null;
  readonly body_html?: string | null;
  readonly path?: string;
  readonly line?: number;
  readonly original_line?: number;
  readonly start_line?: number | null;
  readonly side?: string;
  readonly start_side?: string | null;
  readonly commit_id?: string;
  readonly original_commit_id?: string;
  readonly diff_hunk?: string;
  readonly pull_request_review_id?: number;
  readonly in_reply_to_id?: number;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly html_url?: string;
};

export type GitHubPullRequestContextIssueComment = {
  readonly id?: number;
  readonly user?: GitHubPullRequestContextAuthor;
  readonly body?: string | null;
  readonly body_text?: string | null;
  readonly body_html?: string | null;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly html_url?: string;
};

export type GitHubPullRequestContextCommit = {
  readonly sha?: string;
  readonly html_url?: string;
  readonly author?: GitHubPullRequestContextAuthor;
  readonly commit?: {
    readonly message?: string;
    readonly author?: {
      readonly name?: string;
      readonly email?: string;
      readonly date?: string;
    };
  };
};

export type GitHubPullRequestFileVersionSnapshot = {
  readonly path: string;
  readonly ref: string;
  readonly encoding?: "utf8" | "base64";
  readonly contents?: string;
  readonly sizeBytes?: number;
  readonly error?: string;
};

export type GitHubPullRequestFileSnapshot = {
  readonly path: string;
  readonly status?: string;
  readonly previousPath?: string;
  readonly base?: GitHubPullRequestFileVersionSnapshot;
  readonly head?: GitHubPullRequestFileVersionSnapshot;
};

export type GitHubPullRequestContextResponse = {
  readonly host: string;
  readonly repository: string;
  readonly pullRequestNumber: number;
  readonly capturedAt: string;
  readonly pullRequest: GitHubPullRequestContextDetails;
  readonly files: ReadonlyArray<GitHubPullRequestContextFile>;
  readonly reviews: ReadonlyArray<GitHubPullRequestContextReview>;
  readonly reviewComments: ReadonlyArray<GitHubPullRequestContextReviewComment>;
  readonly issueComments: ReadonlyArray<GitHubPullRequestContextIssueComment>;
  readonly commits: ReadonlyArray<GitHubPullRequestContextCommit>;
  readonly fileSnapshots: ReadonlyArray<GitHubPullRequestFileSnapshot>;
  readonly diff?: string;
  readonly warnings?: ReadonlyArray<string>;
};
