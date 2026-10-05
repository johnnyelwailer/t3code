import type { OrchestrationV2Subagent, ThreadId } from "@t3tools/contracts";
import { projectedSubagentsToRuntime } from "@t3tools/client-runtime/state/subagentRuntime";
import { useMemo } from "react";

import {
  type ActiveAgentEntry,
  EMPTY_ACTIVE_AGENTS,
  mergeActiveAgentsAndChildren,
} from "~/t3team/chat/t3team-activeAgentsCore";
import { useT3TeamChildThreadRelationsStore } from "~/t3team/t3team-childThreadRelationsStore";
import type { ProjectThread } from "~/t3team/t3team-types";

const NO_CHILDREN: ReadonlyArray<ProjectThread> = [];

/**
 * GHE #201: the working row's active agents — this thread's running app-owned children (the
 * sidebar's lineage-fed child relation, mirrored in `t3team-childThreadRelationsStore`) plus its
 * live projection subagents. A delegated task appears in both; its child thread wins.
 */
export function useT3TeamActiveAgents(input: {
  readonly threadId: ThreadId | null;
  readonly subagents: ReadonlyArray<OrchestrationV2Subagent> | undefined;
}): readonly ActiveAgentEntry[] {
  const { threadId, subagents } = input;
  const children = useT3TeamChildThreadRelationsStore((state) =>
    threadId === null ? undefined : state.childThreadsByParentId.get(threadId),
  );
  const childThreads = children ?? NO_CHILDREN;
  return useMemo(() => {
    if (childThreads.length === 0 && (subagents?.length ?? 0) === 0) return EMPTY_ACTIVE_AGENTS;
    const childIds = new Set(childThreads.map((child) => child.id));
    const ownSubagents = (subagents ?? []).filter(
      (subagent) => subagent.childThreadId === null || !childIds.has(subagent.childThreadId),
    );
    return mergeActiveAgentsAndChildren({
      childThreads,
      subagents: projectedSubagentsToRuntime(ownSubagents),
    });
  }, [childThreads, subagents]);
}
