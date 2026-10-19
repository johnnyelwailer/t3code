import { useMemo } from "react";

import { resolveDigestJiraNotice } from "~/t3team/t3team-digestJiraNotice";
import { resolveDigestEmptyLanes } from "~/t3team/t3team-myWorkDigestRenderState";
import { DigestTransitionNamesProvider } from "~/t3team/t3team-digestTransitionNames";
import { digestStructureKey } from "~/t3team/t3team-digestStructureKey";
import { ProjectMyWorkDigestBody } from "~/t3team/t3team-ProjectMyWorkDigestBody";
import type { DigestBurndownVariant } from "~/t3team/t3team-ProjectMyWorkDigestHeader";
import type { DigestGraph, ResolvedDigestPlan } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { useDigestViewTransition } from "~/t3team/t3team-useDigestViewTransition";
import { useRetainedDigestContent } from "~/t3team/t3team-useRetainedDigestContent";
import { useDigestPrThreadClaims } from "~/t3team/mywork-digest/t3team-useDigestPrThreadClaims";

export function ProjectMyWorkDigestView({
  plan,
  graph: serverGraph,
  nowMs,
  onOpenTicket,
  burndownVariant = "off",
  updatedAtMs,
  onResetArrangement,
  refreshing = false,
  emptyStateAllowed = true,
  onReload,
}: {
  plan: ResolvedDigestPlan;
  graph: DigestGraph;
  nowMs: number;
  onOpenTicket?: ((ticketId: string) => void) | undefined;
  burndownVariant?: DigestBurndownVariant;
  updatedAtMs?: number;
  /** Clears an agent-made arrangement for this scope (back to the default). */
  onResetArrangement?: (() => Promise<void>) | undefined;
  /** A revalidation is in flight over this content; the header's status strip says so. */
  refreshing?: boolean;
  /**
   * False until a fresh, successful round for this scope has landed: a plan with no sections is
   * then "not known yet", not "nothing", so the lanes keep loading instead of claiming the user is
   * free. Default true — fixtures and stories hand over a settled graph.
   */
  emptyStateAllowed?: boolean;
  /** Re-reads the digest: what the Jira notice's retry and post-sign-in reload call. */
  onReload?: (() => void) | undefined;
}) {
  const graph = useDigestPrThreadClaims(serverGraph, nowMs);
  const incoming = useMemo(() => ({ plan, graph }), [plan, graph]);
  const emptyLanes = resolveDigestEmptyLanes({
    emptyStateAllowed,
    jiraNoticeShown: resolveDigestJiraNotice(graph, nowMs) !== null,
    jiraSyncPending: graph.jiraSyncPending === true,
  });
  const retained = useRetainedDigestContent(
    incoming,
    plan.sections.length > 0,
    emptyLanes === "loading",
  );
  const shown = useDigestViewTransition(
    retained,
    digestStructureKey({
      plan: retained.plan,
      graph: retained.graph,
      noticeShown: resolveDigestJiraNotice(retained.graph, nowMs) !== null,
    }),
  );
  return (
    <DigestTransitionNamesProvider plan={shown.plan}>
      <ProjectMyWorkDigestBody
        plan={shown.plan}
        graph={shown.graph}
        nowMs={nowMs}
        onOpenTicket={onOpenTicket}
        burndownVariant={burndownVariant}
        {...(updatedAtMs !== undefined ? { updatedAtMs } : {})}
        onResetArrangement={onResetArrangement}
        refreshing={refreshing}
        emptyStateAllowed={emptyStateAllowed}
        onReload={onReload}
      />
    </DigestTransitionNamesProvider>
  );
}
