import type { DigestDependency, DigestGraph } from "~/t3team/t3team-projectMyWorkDigestTypes";
import {
  getDigestTicketStage,
  isDigestStageInDevelopment,
} from "~/t3team/t3team-projectMyWorkDigestStage";

/** Every PR naming the ticket has merged — its code has landed, whatever Jira says yet. */
function allPrsMerged(graph: DigestGraph, ticketId: string): boolean {
  const prs = graph.changeRequests.filter((pr) => pr.ticketId === ticketId);
  return prs.length > 0 && prs.every((pr) => pr.state === "merged");
}

/**
 * Whether a `blocks` link still holds anyone up. It does while the blocking ticket is still in
 * development: once it moved to review or test, or all of its PRs merged, the work the other
 * ticket waited on exists. The blocker is the other ticket for `you-wait-on`, the viewer's own for
 * `waits-on-you` (unknown to the digest: still counts). Same-story links are no blocks: false.
 */
export function isDigestBlockLive(graph: DigestGraph, dependency: DigestDependency): boolean {
  if (dependency.relation === "same-story") return false;
  if (dependency.relation === "you-wait-on") {
    return isDigestStageInDevelopment(getDigestTicketStage(dependency.other.status));
  }
  if (getDigestTicketStage(dependency.other.status) === "done") return false;
  const mine = graph.tickets.find((ticket) => ticket.id === dependency.ticketId);
  if (mine === undefined) return true;
  return (
    isDigestStageInDevelopment(getDigestTicketStage(mine.status)) &&
    !allPrsMerged(graph, dependency.ticketId)
  );
}
