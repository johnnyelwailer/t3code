import {
  isDigestTicketDone,
  type DigestChangeRequest,
  type DigestGraph,
  type DigestItemAction,
  type DigestReviewer,
  type DigestReviewRequest,
} from "~/t3team/t3team-projectMyWorkDigestPlan";
import { digestChangeRequestScope } from "~/t3team/t3team-digestRecipeAction";
import { buildProjectTicketHierarchy } from "~/t3team/t3team-ticketHierarchy";

const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The PR's page on its own host. A GitHub Enterprise PR links to its GHE install; a PR without a
 * host (older server payloads, blocker mentions) falls back to github.com.
 */
function digestHostOrigin(host: string | undefined): string {
  const bare = host
    ?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `https://${bare ? bare : "github.com"}`;
}

export function digestPrUrl(pr: Pick<DigestChangeRequest, "repo" | "number" | "host">): string {
  return `${digestHostOrigin(pr.host)}/${pr.repo}/pull/${pr.number}`;
}

/** The reviewer's profile on the PR's host (a GHE reviewer is not on github.com). */
export function digestReviewerUrl(
  reviewer: Pick<DigestReviewer, "login">,
  host?: string | undefined,
): string {
  return `${digestHostOrigin(host)}/${reviewer.login}`;
}

/**
 * A PR title without the ticket key it opens with, for places that already show that key beside
 * it ("IES-1 Fix login" under IES-1 reads "Fix login"). A title naming another ticket stays whole.
 */
export function digestTitleWithoutKey(title: string, key: string | undefined): string {
  if (!key || !title.toUpperCase().startsWith(key.toUpperCase())) return title;
  const rest = title.slice(key.length);
  if (rest !== "" && !/^[\s:\-–|\]\)]/.test(rest)) return title;
  return rest.replace(/^[\s:\-–|\]\)]+/, "") || title;
}

export function digestPrsFor(graph: DigestGraph, ticketId: string): readonly DigestChangeRequest[] {
  return graph.changeRequests.filter((pr) => pr.ticketId === ticketId);
}

/**
 * The one short line every digest item carries: what to do about it, in the order the owner
 * reads it. Exactly one wins; the rest stay as chips on the row. `pr` is the PR the line
 * points at, so the row can render `repo#number` as a link.
 */
export type DigestAction = {
  readonly text: string;
  readonly pr?: { readonly repo: string; readonly number: number; readonly host?: string };
};

export function digestActionLine(graph: DigestGraph, ticketId: string): DigestAction | null {
  const blocker = graph.blockers.find((entry) => entry.ticketId === ticketId);
  if (blocker)
    return { text: `blocked by enabler PR ${blocker.repo}#${blocker.number}`, pr: blocker };
  if (graph.decisions.some((decision) => decision.ticketId === ticketId))
    return { text: "needs your decision" };
  const prs = digestPrsFor(graph, ticketId);
  const reReview = prs.find((pr) => pr.state === "changes-requested");
  if (reReview)
    return { text: `needs re-review · ${reReview.repo}#${reReview.number}`, pr: reReview };
  const yours = prs.find((pr) => pr.state === "needs-you");
  if (yours) return { text: `review requested · ${yours.repo}#${yours.number}`, pr: yours };
  const failing = prs.find((pr) => pr.state === "ci-failing");
  if (failing) return { text: `ci failing on ${failing.repo}#${failing.number}`, pr: failing };
  const comments = prs.reduce((sum, pr) => sum + (pr.unhandledComments ?? 0), 0);
  if (comments > 0)
    return { text: `${comments} new unhandled comment${comments === 1 ? "" : "s"}` };
  return null;
}

/**
 * The concrete next steps a digest item offers, derived from its state in the same priority
 * order as the action line. The first entry is primary (always visible); the rest reveal on
 * row hover. Links open threads/PRs; `recipe` entries stage that recipe, scoped to their PR.
 */
export function digestItemActions(
  graph: DigestGraph,
  ticketId: string,
  nowMs: number,
): readonly DigestItemAction[] {
  const actions: DigestItemAction[] = [];
  const blocker = graph.blockers.find((entry) => entry.ticketId === ticketId);
  if (blocker) {
    actions.push({
      label: "Open enabler",
      href: digestPrUrl(blocker),
    });
    return actions;
  }
  const decision = graph.decisions.find((entry) => entry.ticketId === ticketId);
  if (decision) {
    const thread =
      graph.claims.find((claim) => claim.threadId === decision.threadId) ??
      graph.claims.find((claim) => claim.ticketId === ticketId);
    if (thread?.threadUrl) actions.push({ label: "Open thread", href: thread.threadUrl });
    return actions;
  }
  const prs = digestPrsFor(graph, ticketId);
  const ticket = graph.tickets.find((entry) => entry.id === ticketId);
  const onPr = (label: string, recipe: string, pr: DigestChangeRequest): DigestItemAction => {
    const scope = digestChangeRequestScope({
      ...pr,
      projectId: pr.projectId ?? ticket?.projectId,
      ...(ticket ? { workItem: { key: ticket.ref.displayId, title: ticket.ref.title } } : {}),
    });
    return scope ? { label, recipe, scope } : { label, recipe };
  };
  const reReview = prs.find((pr) => pr.state === "changes-requested");
  if (reReview) {
    actions.push(onPr("Handle comments", "pr-handle-comments", reReview), {
      label: "Open PR",
      href: digestPrUrl(reReview),
    });
    return actions;
  }
  const yours = prs.find((pr) => pr.state === "needs-you");
  if (yours) {
    actions.push(
      { label: "Review PR", href: digestPrUrl(yours) },
      onPr("Review with agent", "pr-review", yours),
    );
    return actions;
  }
  const failing = prs.find((pr) => pr.state === "ci-failing");
  if (failing) {
    actions.push(
      { label: "View CI", href: digestPrUrl(failing) },
      onPr("Fix checks", "pr-fix-ci", failing),
    );
    return actions;
  }
  const commented = prs.find((pr) => (pr.unhandledComments ?? 0) > 0);
  if (commented) {
    actions.push(onPr("Handle comments", "pr-handle-comments", commented));
    return actions;
  }
  const stale = graph.claims.some(
    (claim) =>
      claim.ticketId === ticketId && nowMs - Date.parse(claim.lastActivityAt) > STALE_AFTER_MS,
  );
  if (stale) actions.push({ label: "Nudge", recipe: "nudge-agent-thread" });
  return actions;
}

/** A review request's next step: hand the review to an agent, scoped to that PR. */
export function digestReviewActions(review: DigestReviewRequest): readonly DigestItemAction[] {
  const scope = digestChangeRequestScope({
    ...review,
    ...(review.workItemKey ? { workItem: { key: review.workItemKey } } : {}),
  });
  return scope ? [{ label: "Review with agent", recipe: "pr-review", scope }] : [];
}

/**
 * Done/total over the story's direct children in the graph. Null when the story has no
 * children: a story without tasks shows no progress bar, not a 0/0.
 */
export function digestStoryProgress(
  graph: DigestGraph,
  storyId: string,
): { readonly done: number; readonly total: number } | null {
  const children = buildProjectTicketHierarchy(graph.tickets).childrenByParentId.get(storyId);
  if (!children || children.length === 0) return null;
  const done = children.filter(isDigestTicketDone).length;
  return { done, total: children.length };
}
