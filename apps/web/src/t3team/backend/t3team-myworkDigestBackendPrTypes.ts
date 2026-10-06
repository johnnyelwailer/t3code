/** The digest payload's pull-request wire types, split from `t3team-myworkDigestBackendApi.ts`. */

/** A person on a PR; `avatarUrl` is the host's own picture where it gave one. */
export type MyWorkDigestPerson = {
  readonly name: string;
  readonly login: string;
  readonly avatarUrl?: string;
};

/** One PR row as the server sends it (mirrors the server's `T3TeamDigestChangeRequest`). */
export type MyWorkDigestChangeRequest = {
  readonly id: string;
  /** Absent on payloads from a server that predates the field. */
  readonly host?: string;
  readonly repo: string;
  readonly number: number;
  readonly state:
    | "draft"
    | "open"
    | "needs-you"
    | "changes-requested"
    | "ci-failing"
    | "approved"
    | "merged";
  readonly updatedAt: string;
  readonly workItemKey?: string;
  readonly title?: string;
  /** The viewer wrote it, or is asked to review it (host-wide search; absent on older servers). */
  readonly viewerAuthored?: boolean;
  readonly viewerReviewRequested?: boolean;
  readonly authorLogin?: string;
  readonly author?: MyWorkDigestPerson;
  /** Everyone but the author who already commented or reviewed. */
  readonly engaged?: ReadonlyArray<MyWorkDigestPerson>;
  readonly additions?: number;
  readonly deletions?: number;
  /** Open PRs only, off the server's cached detail read. */
  readonly reviewers?: ReadonlyArray<MyWorkDigestPerson>;
  readonly unhandledReviewThreads?: ReadonlyArray<{ readonly lastCommentAt?: string }>;
};
