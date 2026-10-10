import type { OrchestrationV2Subagent, ServerProvider, ThreadId } from "@t3tools/contracts";
import { projectedSubagentsToRuntime } from "@t3tools/client-runtime/state/subagentRuntime";
import { useMemo } from "react";

import { usePrimarySettings } from "~/hooks/useSettings";
import { useServerConfigs } from "~/state/entities";
import {
  type ActiveAgentEntry,
  EMPTY_ACTIVE_AGENTS,
  mergeActiveAgentsAndChildren,
} from "~/t3team/chat/t3team-activeAgentsCore";
import { useT3TeamChildThreadRelationsStore } from "~/t3team/t3team-childThreadRelationsStore";
import type { ProjectThread } from "~/t3team/t3team-types";

const NO_CHILDREN: ReadonlyArray<ProjectThread> = [];

function findProvider(
  configs: ReturnType<typeof useServerConfigs>,
  instanceId: string | undefined,
): ServerProvider | undefined {
  if (instanceId === undefined) return undefined;
  for (const config of configs.values()) {
    const found = config.providers.find((provider) => provider.instanceId === instanceId);
    if (found) return found;
  }
  return undefined;
}

function providerMark(
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
  const activityLabelsEnabled = usePrimarySettings(
    (settings) => settings.t3teamActivityLabelsEnabled,
  );
  const configs = useServerConfigs();
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
    const merged = mergeActiveAgentsAndChildren({
      childThreads,
      subagents: projectedSubagentsToRuntime(ownSubagents),
      activityLabelsEnabled,
    });
    if (merged.length === 0) return merged;
    return merged.map((entry) => {
      if (entry.source === "child") {
        const child = childThreads.find((thread) => `child:${thread.id}` === entry.id);
        const provider = findProvider(configs, child?.providerInstanceId);
        const mark = providerMark(provider);
        return mark ? { ...entry, provider: mark } : entry;
      }
      const agent = ownSubagents.find((subagent) => `agent:${subagent.id}` === entry.id);
      const provider = findProvider(configs, agent?.providerInstanceId);
      const mark = providerMark(provider, agent?.driver);
      return mark ? { ...entry, provider: mark } : entry;
    });
  }, [activityLabelsEnabled, childThreads, configs, subagents]);
}
