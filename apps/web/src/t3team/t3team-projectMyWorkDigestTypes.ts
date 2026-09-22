import type { ProjectTicket } from "~/t3team/t3team-types";

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
  readonly goal: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
};

export type DigestProject = { readonly id: string; readonly name: string; readonly url?: string };

export type DigestGraph = {
  readonly scope: "project" | "all";
  readonly projects: readonly DigestProject[];
  readonly viewer: { readonly name: string; readonly role: string; readonly lastVisitAt: string };
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
  readonly transitions: readonly DigestTransition[];
  readonly blockers: readonly DigestBlocker[];
};

export type DigestFacet = "decision" | "claim" | "changeRequest" | "moved" | "stalled";

export type DigestItemRef = { readonly ticketId: string; readonly why?: string };

export type DigestPlacement = "side" | "main" | "footer";

export type DigestSection = {
  readonly id: string;
  readonly kind: "items";
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
