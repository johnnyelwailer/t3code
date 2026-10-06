import type { ProjectMyWorkStatusCategory } from "./t3team-projectMyWorkShared";
import type { ProjectTicket } from "~/t3team/t3team-types";

/**
 * The user-selected My Work filters, applied to the digest lens the same way they shape the
 * legacy list/board lenses. All-projects values ("all") mean "no filter".
 */
export type DigestFilterState = {
  readonly query: string;
  readonly statusCategory: ProjectMyWorkStatusCategory;
  readonly excludedTypeKeys: readonly string[];
  readonly selectedPriority: string;
  readonly selectedStatus: string;
};

export type DigestClaim = {
  readonly threadId: string;
  readonly threadTitle: string;
  readonly ticketId: string;
  readonly agent: string;
  readonly lastActivityAt: string;
  /** Where the claiming thread lives, so the dot can link to it. */
  readonly threadUrl?: string;
  /** Known run state (PR-linked threads): a running thread pulses, a finished one is outlined. */
  readonly running?: boolean;
  readonly finished?: boolean;
};

export type DigestDecision = {
  readonly id: string;
  readonly ticketId: string;
  readonly threadId: string;
  readonly question: string;
  readonly requiredRole: string;
  readonly askedAt: string;
};

/**
 * A PR reviewer as the digest sees them: a person chip (name, avatar) plus the verdict they
 * have left on the PR, if any. `login` is the GitHub handle the chip links to.
 */
export type DigestReviewer = {
  readonly name: string;
  readonly login: string;
  readonly avatarUrl?: string;
  readonly decision?: "approved" | "changes-requested";
};

export type DigestChangeRequest = {
  readonly id: string;
  readonly ticketId: string;
  readonly title?: string;
  /** The app project whose digest carried it — the PR detail panel reads through that project. */
  readonly projectId?: string;
  /** The PR host (github.com or a GHE install); absent means github.com. */
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
  readonly reviewers: readonly DigestReviewer[];
  /** Unhandled review comments since the viewer's last visit. */
  readonly unhandledComments?: number;
  readonly additions?: number;
  readonly deletions?: number;
  readonly updatedAt: string;
};

/**
 * Someone else's PR waiting for the viewer's review — work they owe a colleague, not their own.
 * `ticketId` is set when the PR names a ticket the digest holds; a colleague's ticket keeps just
 * its key.
 */
export type DigestPrPerson = {
  readonly name: string;
  readonly login: string;
  readonly avatarUrl?: string;
};

export type DigestReviewRequest = {
  readonly id: string;
  readonly projectId: string;
  readonly host?: string;
  readonly repo: string;
  readonly number: number;
  readonly title: string;
  readonly updatedAt: string;
  /** Who opened it: the person waiting on the viewer. */
  readonly author?: DigestPrPerson;
  /** Other humans asked to review, and those who already commented: someone is on it already. */
  readonly reviewers?: readonly DigestPrPerson[];
  readonly engaged?: readonly DigestPrPerson[];
  readonly additions?: number;
  readonly deletions?: number;
  readonly workItemKey?: string;
  readonly ticketId?: string;
};

/**
 * A person one of the viewer's tickets depends on, or who depends on it: their ticket `blocks`
 * the viewer's (`you-wait-on`), the viewer's blocks theirs (`waits-on-you`), or it shares the
 * story (`same-story`: the backend to the viewer's frontend).
 */
export type DigestDependency = {
  readonly ticketId: string;
  readonly relation: "waits-on-you" | "you-wait-on" | "same-story";
  readonly other: {
    readonly key: string;
    readonly title: string;
    readonly status: string;
    readonly assignee?: string;
    readonly assigneeAvatarUrl?: string;
    readonly url?: string;
  };
};

/** A PR that gates a ticket: the ticket's action line reads "blocked by enabler PR repo#n". */
export type DigestBlocker = {
  readonly ticketId: string;
  readonly repo: string;
  readonly number: number;
};

export type { DigestItemAction } from "./t3team-digestRecipeAction";

export type DigestTransition = {
  readonly ticketId: string;
  readonly from: string;
  readonly to: string;
  readonly at: string;
};

export type DigestSprint = {
  readonly name: string;
  /** Jira sprint state when the server knows it; `active` can still be past its end date. */
  readonly state?: string;
  readonly goal: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
};

export type DigestProject = { readonly id: string; readonly name: string; readonly url?: string };

export type DigestGraph = {
  readonly scope: "project" | "all";
  readonly projects: readonly DigestProject[];
  readonly viewer: { readonly name: string; readonly role: string; readonly lastVisitAt: string };
  /** When the oldest project's Jira tickets last matched Jira (ISO). */
  readonly jiraSyncedAt?: string;
  readonly sprint?: DigestSprint;
  /** The viewer's personal burndown for the digest sprint, in the project's estimate unit. */
  readonly burndown?: {
    readonly unit: "points" | "hours";
    readonly total: number;
    readonly points: readonly { readonly date: string; readonly remaining: number }[];
  };
  readonly tickets: readonly ProjectTicket[];
  readonly claims: readonly DigestClaim[];
  readonly decisions: readonly DigestDecision[];
  readonly changeRequests: readonly DigestChangeRequest[];
  /** Absent on graphs built before the review lane existed (fixtures, stories). */
  readonly reviewRequests?: readonly DigestReviewRequest[];
  readonly dependencies?: readonly DigestDependency[];
  readonly transitions: readonly DigestTransition[];
  readonly blockers: readonly DigestBlocker[];
  /** The previous working day (merged PRs, moved tickets); absent when there is nothing. */
  readonly yesterday?: DigestYesterday;
  /** The arrangement an agent stored for this scope (the arrange-my-work recipe); absent = default. */
  readonly arrangement?: DigestPlan;
};

/** A PR the viewer merged in the previous working day; `ticketId` when it names a held ticket. */
export type DigestYesterdayMerged = {
  readonly id: string;
  /** The app project whose digest carried it — the PR detail panel reads through that project. */
  readonly projectId: string;
  readonly host?: string;
  readonly repo: string;
  readonly number: number;
  readonly title: string;
  readonly mergedAt: string;
  readonly workItemKey?: string;
  readonly ticketId?: string;
};

/**
 * One of the viewer's tickets that moved in the previous working day. `from`/`to` are the statuses
 * when the mirror saw the move; a ticket Jira merely updated carries neither.
 */
export type DigestYesterdayMoved = {
  readonly ticketId: string;
  readonly from?: string;
  readonly to?: string;
  readonly at: string;
};

export type DigestYesterday = {
  readonly merged: readonly DigestYesterdayMerged[];
  readonly moved: readonly DigestYesterdayMoved[];
};

export type DigestFacet = "decision" | "claim" | "changeRequest" | "moved" | "stalled";

export type DigestItemRef = { readonly ticketId: string; readonly why?: string };

export type DigestPlacement = "side" | "main" | "footer";

/**
 * One block of the digest. `items` sections list tickets; `reviews` sections list the PRs in
 * `reviewIds` (graph `reviewRequests` ids) — PRs, because a review owed is not one of the viewer's
 * tickets; `graph` sections list nothing, their widget reads the graph itself (yesterday). A plan
 * from any producer (the heuristic, an agent) arranges these same kinds.
 */
export type DigestSection = {
  readonly id: string;
  readonly kind: "items" | "reviews" | "graph";
  /** The `dashboard.widget` that renders it; absent means the default for its `kind`. */
  readonly widget?: string;
  readonly reviewIds?: readonly string[];
  readonly placement: DigestPlacement;
  readonly heading: string;
  readonly hint?: string;
  readonly items: readonly DigestItemRef[];
};

export type DigestPlan = {
  readonly producer: "heuristic" | "agent";
  readonly producedAt: string;
  readonly sections: readonly DigestSection[];
};

export type ResolvedDigestPlan = DigestPlan & {
  readonly droppedTicketIds: readonly string[];
  readonly newSinceTicketIds: readonly string[];
};
