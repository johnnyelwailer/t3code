/**
 * What a My Work digest body shows, for both the per-project and the all-projects view.
 *
 * The rule this file exists to enforce: **an empty state needs a fresh, successful result for the
 * scope on screen.** Everything else that happens to produce no items — a cold start, a paint from
 * the stored graph, a poll still in flight — is loading, and says so. Showing "Nothing needs you"
 * for any of those is the cold-start bug: the digest told the user their work did not exist while
 * it was still finding out.
 *
 * The other half of the rule is the caller's: a digest may only be rendered once its scoped
 * project list is known (see t3team-myWorkBoundProjects), because a partial list is a different,
 * smaller scope that can be legitimately empty.
 */
import type { UseMyWorkDigestGraphResult } from "~/t3team/mywork-digest/t3team-useMyWorkDigestGraphTypes";

export type MyWorkDigestRenderState =
  /** Nothing to paint yet — show the loading animation, never an empty state. */
  | "loading"
  /** The fetch failed transiently; the poller is backing off and recovers on its own. */
  | "retrying"
  | "session-expired"
  | "error"
  | "sign-in"
  /** A graph to render. Cached graphs land here too, with `refreshing` driving the stale hint. */
  | "content"
  /** A fresh, successful round for this scope that genuinely has nothing in it. */
  | "empty";

export type MyWorkDigestRenderInput = Pick<
  UseMyWorkDigestGraphResult,
  "status" | "freshness" | "sessionExpired" | "viewerUnresolved"
> & {
  readonly hasGraph: boolean;
  readonly ticketCount: number;
};

export function resolveMyWorkDigestRenderState(
  input: MyWorkDigestRenderInput,
): MyWorkDigestRenderState {
  // A dead refresh token is terminal wherever we are: only signing in recovers it.
  if (input.sessionExpired) return "session-expired";
  if (input.status === "error") return "error";
  if (input.hasGraph) {
    if (!input.viewerUnresolved || input.ticketCount > 0) return "content";
    // The server had no Jira identity, so an empty graph says nothing about the user's work. A
    // stored graph only says that was true LAST time: asking to sign in needs a fresh round.
    if (input.freshness === "fresh") return "sign-in";
  }
  // No graph to paint. A failing fetch says so; everything else is still on its way.
  if (input.status === "retrying") return "retrying";
  if (input.freshness !== "fresh" || input.status !== "ready") return "loading";
  return input.viewerUnresolved ? "sign-in" : "empty";
}

export type DigestEmptyLanes =
  /** The round that would say "nothing" has not landed yet. */
  | "loading"
  | "nothing"
  /** No tickets, but the Jira half is stale or signed out: an empty list proves nothing. */
  | "unverified";

/**
 * What an empty digest says. "Nothing needs you" is a claim about the user's work, so it needs the
 * Jira half to be current as well as the round to be fresh; when it is not, the Jira notice above
 * is the whole message and the empty panel stays out of its way.
 */
export function resolveDigestEmptyLanes(input: {
  readonly emptyStateAllowed: boolean;
  readonly jiraNoticeShown: boolean;
}): DigestEmptyLanes {
  if (!input.emptyStateAllowed) return "loading";
  return input.jiraNoticeShown ? "unverified" : "nothing";
}
