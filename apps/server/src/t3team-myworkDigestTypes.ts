/**
 * My Work Digest wire types — the single aggregated read behind
 * `POST /api/t3team/mywork-digest/graph` (and its `/poll` sibling).
 *
 * The server returns RAW material (mirror issue refs, thread claims, pending
 * workflow asks, cached PR rows, status transitions, sprints) and the client
 * hook (`useMyWorkDigestGraph`) shapes it into the web `DigestGraph` contract,
 * so the ticket mapping (`resourceRefToProjectTicket`) stays where it lives.
 */

import type { BacklogResourceRef } from "./t3team-atlassian-backlog-cacheShared.ts";
import type { T3TeamPollEnvelope } from "./t3team-integration-polling.ts";

export type T3TeamMyWorkDigestAccountRef = {
  readonly id: string;
  readonly provider: string;
};

/**
 * One Jira project entry. `appProjectId` is the app-workspace project that owns
 * this Jira project's threads and pull requests; absent (or empty) means
 * claims/decisions/change requests are skipped for this entry rather than
 * guessed.
 */
export type T3TeamMyWorkDigestProjectInput = {
  readonly account: T3TeamMyWorkDigestAccountRef;
  readonly externalProjectId: string;
  readonly appProjectId?: string;
  readonly name?: string;
};

export type T3TeamMyWorkDigestScope = "project" | "all";

export type T3TeamMyWorkDigestInput = {
  readonly scope: T3TeamMyWorkDigestScope;
  readonly projects: ReadonlyArray<T3TeamMyWorkDigestProjectInput>;
  /** The viewer's Jira display name; drives the personal burndown when present. */
  readonly viewer?: { readonly name?: string };
};

export type T3TeamMyWorkDigestPollInput = T3TeamMyWorkDigestInput & {
  readonly poll: T3TeamPollEnvelope;
};

/** Opaque ticket pointer: the digest never trusts the client's ids, it re-joins. */
export type T3TeamDigestTicketRef = {
  readonly issueId?: string;
  readonly issueKey?: string;
};

export type T3TeamDigestClaim = {
  readonly threadId: string;
  readonly threadTitle: string;
  readonly ticketRef: T3TeamDigestTicketRef;
  readonly agent: string;
  readonly lastActivityAt: string;
};

/** A pending `askUser` parked on a suspended workflow run (pending_kind user.input). */
export type T3TeamDigestDecision = {
  readonly id: string;
  readonly threadId: string;
  readonly ticketRef: T3TeamDigestTicketRef;
  readonly question: string;
  readonly askedAt: string;
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
  readonly repo: string;
  readonly number: number;
  readonly state: T3TeamDigestChangeRequestState;
  readonly updatedAt: string;
  /** The matched ticket's key, when the PR title/branch names one of this project's issues. */
  readonly workItemKey?: string;
  /** Open PRs only, off the cached detail/activity reads. */
  readonly reviewers?: ReadonlyArray<{ readonly name: string; readonly login: string }>;
  readonly unhandledReviewThreads?: ReadonlyArray<{ readonly lastCommentAt?: string }>;
};

export type T3TeamDigestTransition = {
  readonly ticketRef: T3TeamDigestTicketRef;
  readonly from: string;
  readonly to: string;
  readonly at: string;
};

/** A PR that gates a ticket: Jira "is blocked by" links or PR body mentions. */
export type T3TeamDigestBlocker = {
  readonly ticketRef: T3TeamDigestTicketRef;
  readonly repo: string;
  readonly number: number;
};

/** The viewer's personal burndown for the active sprint, in the project's estimate unit. */
export type T3TeamDigestBurndown = {
  readonly unit: "points" | "hours";
  readonly total: number;
  readonly points: ReadonlyArray<{ readonly date: string; readonly remaining: number }>;
};

export type T3TeamDigestSprint = {
  readonly name: string;
  readonly goal?: string;
  readonly startDate?: string;
  readonly endDate?: string;
};

export type T3TeamDigestProjectData = {
  readonly project: { readonly id: string; readonly name: string };
  readonly tickets: ReadonlyArray<BacklogResourceRef>;
  readonly claims: ReadonlyArray<T3TeamDigestClaim>;
  readonly decisions: ReadonlyArray<T3TeamDigestDecision>;
  readonly changeRequests: ReadonlyArray<T3TeamDigestChangeRequest>;
  readonly transitions: ReadonlyArray<T3TeamDigestTransition>;
  readonly sprint?: T3TeamDigestSprint;
  readonly blockers?: ReadonlyArray<T3TeamDigestBlocker>;
  readonly burndown?: T3TeamDigestBurndown;
  /** Set when the PR host could not be read this round (the list degrades, it does not fail). */
  readonly changeRequestNote?: string;
};

export type T3TeamMyWorkDigestPayload = {
  readonly scope: T3TeamMyWorkDigestScope;
  readonly projects: ReadonlyArray<T3TeamDigestProjectData>;
  /** The viewer as the server resolved them (display name from the mirror). */
  readonly viewer?: { readonly name: string };
};

/**
 * The join inputs the aggregation works on: everything the SQL/PR reads
 * produced, keyed per project, so the pure joiner stays testable without a DB.
 */
export type T3TeamDigestProjectSource = {
  readonly input: T3TeamMyWorkDigestProjectInput;
  readonly tickets: ReadonlyArray<BacklogResourceRef>;
  readonly threadTickets: ReadonlyArray<{
    readonly threadId: string;
    readonly ticketRef: T3TeamDigestTicketRef;
  }>;
  readonly claims: ReadonlyArray<T3TeamDigestClaim>;
  readonly decisions: ReadonlyArray<T3TeamDigestDecision>;
  readonly prEntries: ReadonlyArray<{
    readonly host: string;
    readonly repository: string;
    readonly number: number;
    readonly title: string;
    readonly headBranch: string;
    readonly state: string;
    readonly isDraft: boolean;
    readonly updatedAt: string;
    readonly viewerReviewRequested: boolean;
    readonly reviewDecision?: string;
    readonly checksState?: string;
    /** Open PRs only, from the cached detail/activity reads. */
    readonly reviewers?: ReadonlyArray<{ readonly name: string; readonly login: string }>;
    readonly unhandledReviewThreads?: ReadonlyArray<{ readonly lastCommentAt?: string }>;
    /** The PR body, for open PRs only (the blocker mention source). */
    readonly body?: string;
  }>;
  readonly transitions: ReadonlyArray<T3TeamDigestTransition>;
  /**
   * The sprint's full status history (changelog backfill), merged into the
   * burndown only — the capped `transitions` above stay the "what moved" read.
   */
  readonly burndownTransitions?: ReadonlyArray<T3TeamDigestTransition>;
  /** The Jira display name the mirror assigns to the viewer; empty skips the burndown. */
  readonly viewerName?: string;
  /** The project's estimate unit (points where an estimate field is configured, hours otherwise). */
  readonly estimateUnit?: "points" | "hours";
  readonly sprints: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly state?: string;
    readonly goal?: string;
    readonly startDate?: string;
    readonly endDate?: string;
  }>;
  /** Set when the PR host could not be read this round; carried to the payload. */
  readonly changeRequestNote?: string;
  /** The round's clock, so the burndown "today" and unhandled-comment cutoffs are deterministic. */
  readonly nowIso: string;
};
