import { threadPullRequestKeysEqual } from "@t3tools/client-runtime/thread-pull-requests";
import { useMemo } from "react";

import { useThreadShells } from "~/state/entities";
import type { DigestClaim, DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

type Shell = ReturnType<typeof useThreadShells>[number];

const LIVE = new Set(["preparing", "queued", "starting", "running", "waiting"]);
// A finished thread is worth a dot for a week; after that it is history, not presence.
const FINISHED_SHOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Agent threads that work on one of the digest's PRs — a thread the PR was linked to (it opened
 * it, or a review/fix run was started on it) — as claims on the PR's ticket. A running thread is
 * a living dot; a finished one stays as the outlined "was here" dot until it ages out. Threads
 * the server already reports as claiming the ticket are not doubled.
 */
export function digestPrThreadClaims(
  graph: DigestGraph,
  shells: ReadonlyArray<Shell>,
  nowMs: number,
): DigestClaim[] {
  const claimed = new Set(graph.claims.map((claim) => `${claim.threadId}:${claim.ticketId}`));
  const claims: DigestClaim[] = [];
  for (const shell of shells) {
    if (shell.archivedAt || shell.pullRequests.length === 0) continue;
    for (const pr of graph.changeRequests) {
      const key = { host: pr.host ?? "github.com", repository: pr.repo, number: pr.number };
      if (!shell.pullRequests.some((link) => threadPullRequestKeysEqual(link, key))) continue;
      const id = `${shell.id}:${pr.ticketId}`;
      if (claimed.has(id)) continue;
      claimed.add(id);
      const running = shell.latestRun !== null && LIVE.has(shell.latestRun.status);
      if (!running && nowMs - Date.parse(shell.updatedAt) > FINISHED_SHOWN_MS) continue;
      claims.push({
        threadId: shell.id,
        threadTitle: shell.title,
        ticketId: pr.ticketId,
        agent: String(shell.providerInstanceId),
        providerInstanceId: String(shell.providerInstanceId),
        lastActivityAt: shell.updatedAt,
        threadUrl: `/t3team/projects/${shell.projectId}/threads/${shell.id}`,
        ...(running ? { running: true } : { finished: true }),
      });
    }
  }
  return claims;
}

/**
 * Server claims carry only an agent label ("Codex · model"); the thread shell has the real
 * provider instance, which the badge style needs to pick the provider's icon.
 */
export function withClaimProviderInstances(
  claims: ReadonlyArray<DigestClaim>,
  shells: ReadonlyArray<Shell>,
): ReadonlyArray<DigestClaim> {
  const instanceByThread = new Map(
    shells.map((shell) => [String(shell.id), String(shell.providerInstanceId)]),
  );
  return claims.map((claim) => {
    const providerInstanceId = claim.providerInstanceId ?? instanceByThread.get(claim.threadId);
    return providerInstanceId === undefined ? claim : { ...claim, providerInstanceId };
  });
}

/** The graph with PR-linked agent threads added to its claims (dots only; the plan is unchanged). */
export function useDigestPrThreadClaims(graph: DigestGraph, nowMs: number): DigestGraph {
  const shells = useThreadShells();
  return useMemo(() => {
    const extra = digestPrThreadClaims(graph, shells, nowMs);
    const claims = withClaimProviderInstances([...graph.claims, ...extra], shells);
    return claims.length > 0 ? { ...graph, claims } : graph;
  }, [graph, shells, nowMs]);
}
