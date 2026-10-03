/**
 * The thread details panel's "Sub-runs" section: the nested tree of this thread's app-owned
 * sub-runs (V2 `subagent` lineage, as the sidebar's child relation resolves it), status-ordered
 * with idle runs folded — the fork tree that lived in the removed Agents panel. Upstream's
 * relationships list shows the immediate edges; this adds depth, live labels and the settled fold.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { ThreadDetailsSection } from "~/components/chat/ThreadDetailsSection";
import { buildThreadRouteParams } from "~/threadRoutes";
import {
  buildSubRunTree,
  sortSubRunNodes,
  type SubRunOpenCallback,
} from "~/t3team/chat/t3team-AgentsPanelForkSection.logic";
import { T3TeamAgentsPanelSubRunTree } from "~/t3team/chat/t3team-AgentsPanelSubRunTree";
import { useT3TeamChildThreadRelationsStore } from "~/t3team/t3team-childThreadRelationsStore";
import { runT3TeamThreadNavigationOverride } from "~/t3team/t3team-threadNavigationOverride";

export function T3TeamThreadSubRunsSection(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const { environmentId, threadId } = props;
  const childThreadsByParentId = useT3TeamChildThreadRelationsStore(
    (state) => state.childThreadsByParentId,
  );
  const nodes = useMemo(
    () => sortSubRunNodes(buildSubRunTree(threadId, childThreadsByParentId)),
    [childThreadsByParentId, threadId],
  );
  const navigate = useNavigate();
  const openThread = useCallback<SubRunOpenCallback>(
    (input) => {
      const threadRef = scopeThreadRef(environmentId, ThreadId.make(input.threadId));
      if (runT3TeamThreadNavigationOverride(threadRef)) return;
      void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(threadRef) });
    },
    [environmentId, navigate],
  );
  if (nodes.length === 0) return null;
  return (
    <ThreadDetailsSection headingId="thread-details-sub-runs-heading" title="Sub-runs">
      <T3TeamAgentsPanelSubRunTree nodes={nodes} onOpen={openThread} />
    </ThreadDetailsSection>
  );
}
