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
  readonly updatedAt: string;
};

/**
 * Someone else's PR waiting for the viewer's review — work they owe a colleague, not their own.
 * `ticketId` is set when the PR names a ticket the digest holds; a colleague's ticket keeps just
 * its key.
 */
export type DigestReviewRequest = {
  readonly id: string;
  readonly projectId: string;
  readonly host?: string;
  readonly repo: string;
  readonly number: number;
  readonly title: string;
  readonly updatedAt: string;
  readonly workItemKey?: string;
  readonly ticketId?: string;
};

/** A PR that gates a ticket: the ticket's action line reads "blocked by enabler PR repo#n". */
export type DigestBlocker = {
  readonly ticketId: string;
  readonly repo: string;
  readonly number: number;
};

/**
 * One concrete next step on a digest item: either a link (open thread / PR / CI) or a recipe
 * starter (launches a workflow, e.g. "handle review comments"). Items carry 0..n; the first
 * is primary and always visible, the rest reveal on row hover.
 */
export type DigestItemAction = {
  readonly label: string;
  readonly href?: string;
  readonly recipe?: string;
};

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
  readonly transitions: readonly DigestTransition[];
  readonly blockers: readonly DigestBlocker[];
};

export type DigestFacet = "decision" | "claim" | "changeRequest" | "moved" | "stalled";

export type DigestItemRef = { readonly ticketId: string; readonly why?: string };

export type DigestPlacement = "side" | "main" | "footer";

/**
 * One block of the digest. `items` sections list tickets; `reviews` sections list the PRs in
 * `reviewIds` (graph `reviewRequests` ids) — PRs, because a review owed is not one of the viewer's
 * tickets. A plan from any producer (the heuristic, an agent) arranges these same kinds.
 */
export type DigestSection = {
  readonly id: string;
  readonly kind: "items" | "reviews";
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
