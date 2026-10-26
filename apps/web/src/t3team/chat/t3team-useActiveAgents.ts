import type { OrchestrationV2Subagent, ServerProvider, ThreadId } from "@t3tools/contracts";
import { projectedSubagentsToRuntime } from "@t3tools/client-runtime/state/subagentRuntime";
import { useMemo } from "react";

import { useActivityLabelsEnabled } from "~/t3team/t3team-useActivityLabelsEnabled";
import { useEnvironmentProviders } from "~/state/environments";
import {
  type ActiveAgentEntry,
  EMPTY_ACTIVE_AGENTS,
  mergeActiveAgentsAndChildren,
} from "~/t3team/chat/t3team-activeAgentsCore";
import { deriveAwaitingResultEntries } from "~/t3team/chat/t3team-awaitingResultAgents";
import { useT3TeamChildThreadRelationsStore } from "~/t3team/t3team-childThreadRelationsStore";
import type { ProjectThread } from "~/t3team/t3team-types";

const NO_CHILDREN: ReadonlyArray<ProjectThread> = [];

export function findProvider(
  providersByEnvironment: ReturnType<typeof useEnvironmentProviders>,
  instanceId: string | undefined,
): ServerProvider | undefined {
  if (instanceId === undefined) return undefined;
  for (const providers of providersByEnvironment.values()) {
    const found = providers.find((provider) => provider.instanceId === instanceId);
    if (found) return found;
  }
  return undefined;
}

export function providerMark(
  provider: ServerProvider | undefined,
  fallbackDriver?: ServerProvider["driver"],
): ActiveAgentEntry["provider"] {
  const driverKind = provider?.driver ?? fallbackDriver;
  if (!driverKind) return undefined;
  return {
    driverKind,
    displayName: provider?.displayName ?? driverKind,
    ...(provider?.iconDataUrl ? { iconDataUrl: provider.iconDataUrl } : {}),
    ...(provider?.iconUrl ? { acpRegistryIconUrl: provider.iconUrl } : {}),
  };
}

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
  const activityLabelsEnabled = useActivityLabelsEnabled();
  const providersByEnvironment = useEnvironmentProviders();
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
    const live = mergeActiveAgentsAndChildren({
      childThreads,
      subagents: projectedSubagentsToRuntime(ownSubagents),
      activityLabelsEnabled,
    });
    // Finished delegated tasks whose result the agent has not received yet keep the row up
    // (t3team-awaitingResultAgents.ts); a child thread still shown as live wins over its task.
    const liveIds = new Set(live.map((entry) => entry.id));
    const awaiting = deriveAwaitingResultEntries(subagents).filter((entry) => {
      const task = subagents?.find((subagent) => `agent:${subagent.id}` === entry.id);
      return !liveIds.has(entry.id) && !liveIds.has(`child:${task?.childThreadId ?? ""}`);
    });
    const merged = awaiting.length === 0 ? live : [...live, ...awaiting];
    if (merged.length === 0) return merged;
    return merged.map((entry) => {
      if (entry.source === "child") {
        const child = childThreads.find((thread) => `child:${thread.id}` === entry.id);
        const provider = findProvider(providersByEnvironment, child?.providerInstanceId);
        const mark = providerMark(provider);
        return mark ? { ...entry, provider: mark } : entry;
      }
      const agent = subagents?.find((subagent) => `agent:${subagent.id}` === entry.id);
      const provider = findProvider(providersByEnvironment, agent?.providerInstanceId);
      const mark = providerMark(provider, agent?.driver);
      return mark ? { ...entry, provider: mark } : entry;
    });
  }, [activityLabelsEnabled, childThreads, providersByEnvironment, subagents]);
}
