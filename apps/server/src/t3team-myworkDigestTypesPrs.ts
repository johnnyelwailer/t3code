/** The digest's pull-request wire types, split from `t3team-myworkDigestTypes.ts`. */

/** A person on a PR as the digest shows them: GitHub's own avatar where the host gave one. */
export type T3TeamDigestPerson = {
  readonly name: string;
  readonly login: string;
  readonly avatarUrl?: string;
};

/** Mirrors the web `DigestChangeRequest.state` union one-to-one. */
export type T3TeamDigestChangeRequestState =
  | "draft"
  | "open"
  | "needs-you"
  | "changes-requested"
  | "ci-failing"
  | "approved"
  | "merged";

export type T3TeamDigestChangeRequest = {
  readonly id: string;
  /** The host `repo` lives on (github.com or a GitHub Enterprise install), so links can follow it. */
  readonly host: string;
  readonly repo: string;
  readonly number: number;
  readonly state: T3TeamDigestChangeRequestState;
  readonly updatedAt: string;
  /** The matched ticket's key, when the PR title/branch names one of this project's issues. */
  readonly workItemKey?: string;
  readonly title?: string;
  /** The viewer wrote it — theirs to move, as opposed to someone else's up for their review. */
  readonly viewerAuthored?: boolean;
  readonly viewerReviewRequested?: boolean;
  /** Who opened it — the person a review request keeps waiting. */
  readonly authorLogin?: string;
  readonly author?: T3TeamDigestPerson;
  /** Open PRs only, off the cached detail/activity reads. */
  readonly reviewers?: ReadonlyArray<T3TeamDigestPerson>;
  readonly unhandledReviewThreads?: ReadonlyArray<{ readonly lastCommentAt?: string }>;
  /** Everyone but the author who already commented or reviewed. */
  readonly engaged?: ReadonlyArray<T3TeamDigestPerson>;
  readonly additions?: number;
  readonly deletions?: number;
};
