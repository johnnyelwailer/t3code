/**
 * The fork sub-run tree, folded into upstream's Lineage section (`ThreadRelationshipsPanel`).
 *
 * The tree lists this thread's app-owned sub-runs (V2 `subagent` lineage, as the sidebar's child
 * relation resolves it) with depth, live status text and the idle fold. Upstream's rows list the
 * same immediate children, so the panel drops the subagent edges in `childThreadIds` from its own
 * rows and renders `tree` instead: each child is listed once. Provider-native subagents never
 * enter the fork relation and stay upstream rows.
 */
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useMemo, type ReactNode } from "react";

import { buildThreadRouteParams } from "~/threadRoutes";
import {
  buildSubRunTree,
  sortSubRunNodes,
  type SubRunOpenCallback,
} from "~/t3team/chat/t3team-AgentsPanelForkSection.logic";
import { T3TeamAgentsPanelSubRunTree } from "~/t3team/chat/t3team-AgentsPanelSubRunTree";
import { useT3TeamChildThreadRelationsStore } from "~/t3team/t3team-childThreadRelationsStore";
import { runT3TeamThreadNavigationOverride } from "~/t3team/t3team-threadNavigationOverride";

const NO_CHILDREN: ReadonlySet<string> = new Set();

export function useT3TeamThreadSubRuns(
  environmentId: EnvironmentId,
  threadId: ThreadId,
): { readonly childThreadIds: ReadonlySet<string>; readonly tree: ReactNode | null } {
  const childThreadsByParentId = useT3TeamChildThreadRelationsStore(
    (state) => state.childThreadsByParentId,
  );
  const nodes = useMemo(
    () => sortSubRunNodes(buildSubRunTree(threadId, childThreadsByParentId)),
    [childThreadsByParentId, threadId],
  );
  const navigate = useNavigate();
  const { threadId: openThreadId } = useParams({ strict: false });
  const openThread = useCallback<SubRunOpenCallback>(
    (input) => {
      const threadRef = scopeThreadRef(environmentId, ThreadId.make(input.threadId));
      if (runT3TeamThreadNavigationOverride(threadRef)) return;
      void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(threadRef) });
    },
    [environmentId, navigate],
  );
  return useMemo(
    () =>
      nodes.length === 0
        ? { childThreadIds: NO_CHILDREN, tree: null }
        : {
            childThreadIds: new Set(nodes.map((node) => node.thread.id)),
            tree: (
              <T3TeamAgentsPanelSubRunTree
                nodes={nodes}
                openThreadId={openThreadId}
                onOpen={openThread}
              />
            ),
          },
    [nodes, openThread, openThreadId],
  );
}
