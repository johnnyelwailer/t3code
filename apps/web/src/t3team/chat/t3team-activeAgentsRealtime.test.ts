/**
 * GHE #52 — regression: the active-children indicator must track a child thread's live run
 * state, end to end, without the child ever being opened.
 *
 * The chain under test is the real client path from the V2 shell:
 *   live shells (+ fork thread facts) → `syncLiveThreadMetadataToLocalState` +
 *   `mapLiveThreadToProjectThread` (status mapping) → `buildChildThreadRelations`
 *   (parent/child relation from V2 lineage) → `mergeActiveAgentsAndChildren` (the working-row dots).
 */
import { describe, expect, it } from "vite-plus/test";
import {
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2RunStatus,
  type T3TeamThreadFacts,
} from "@t3tools/contracts";

import type { ThreadShell } from "~/types";
import { mergeActiveAgentsAndChildren } from "~/t3team/chat/t3team-activeAgentsCore";
import { buildChildThreadRelations } from "~/t3team/hooks/t3team-childThreadRelationsCore";
import { syncLiveThreadMetadataToLocalState } from "~/t3team/hooks/t3team-threadBridge";
import { makeLiveThreadShell } from "~/t3team/hooks/t3team-threadBridge.testSupport";

const PARENT = ThreadId.make("thread-parent");
const CHILD = ThreadId.make("thread-child");

function shells(childStatus: OrchestrationV2RunStatus | "idle", extra: Partial<ThreadShell> = {}) {
  return [
    makeLiveThreadShell({ id: PARENT, projectId: ProjectId.make("project-test") }),
    makeLiveThreadShell({
      id: CHILD,
      projectId: ProjectId.make("project-test"),
      title: "Investigate regression",
      lineage: { rootThreadId: PARENT, parentThreadId: PARENT, relationshipToParent: "subagent" },
      runtime: {
        status: childStatus,
        activeRunId: null,
        providerInstanceId: ProviderInstanceId.make("codex"),
        providerName: null,
        lastError: null,
        updatedAt: "2026-01-01T01:00:00.000Z",
      },
      ...extra,
    }),
  ];
}

function activeDots(liveThreads: ReadonlyArray<ThreadShell>, activityLabel?: string) {
  const facts = new Map<string, T3TeamThreadFacts>(
    activityLabel === undefined
      ? []
      : [[CHILD, { threadId: CHILD, activityLabel, updatedAt: "2026-01-01T01:00:00.000Z" }]],
  );
  const projectThreads = syncLiveThreadMetadataToLocalState({
    threads: [],
    storedProjects: [],
    liveProjects: [],
    liveThreads,
    factsByThreadId: facts,
  });
  const relations = buildChildThreadRelations(projectThreads);
  return mergeActiveAgentsAndChildren({
    childThreads: relations.childThreadsByParentId.get(PARENT) ?? [],
    subagents: [],
  });
}

describe("active-children indicator live sync (GHE #52)", () => {
  it("lights the child dot while its run is live and clears it when the run settles", () => {
    expect(activeDots(shells("idle"))).toEqual([]);

    const running = activeDots(shells("running"), "Investigating regression");
    expect(running.map((entry) => entry.id)).toEqual(["child:thread-child"]);
    expect(running[0]?.statusLabel).toBe("Investigating regression");

    expect(activeDots(shells("completed"))).toEqual([]);
  });

  it("keeps the dot lit for background work that outlives the child's run", () => {
    const settledButLive = shells("idle", {
      pendingBackgroundTasks: [
        { kind: "command" } as ThreadShell["pendingBackgroundTasks"][number],
      ],
    });
    expect(activeDots(settledButLive).map((entry) => entry.id)).toEqual(["child:thread-child"]);
  });
});
