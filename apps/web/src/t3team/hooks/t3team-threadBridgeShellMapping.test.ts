import { describe, expect, it } from "vite-plus/test";
import {
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type OrchestrationV2RunStatus,
  type T3TeamThreadFacts,
} from "@t3tools/contracts";

import type { ThreadShell } from "~/types";
import { resolveThreadStatusPill } from "~/t3team/components/t3team-projectSidebarShared";
import {
  isListedLiveThread,
  mapLiveThreadToProjectThread,
  syncLiveThreadMetadataToLocalState,
} from "./t3team-threadBridge";
import {
  makeLiveProject,
  makeLiveThreadShell,
  makeProjectThread,
  makeStoredProject,
} from "./t3team-threadBridge.testSupport";

const LIVE_SAVED = ProjectId.make("live-saved");
const UPDATED_AT = "2026-05-22T10:00:00.000Z";

function runtime(status: OrchestrationV2RunStatus | "idle"): ThreadShell["runtime"] {
  return {
    status,
    activeRunId: null,
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: null,
    lastError: null,
    updatedAt: UPDATED_AT,
  };
}

function latestRun(status: OrchestrationV2RunStatus): ThreadShell["latestRun"] {
  return {
    runId: RunId.make("run-1"),
    status,
    requestedAt: null,
    startedAt: null,
    completedAt: status === "running" ? null : "2026-05-22T09:30:00.000Z",
    assistantMessageId: null,
  };
}

function facts(patch: Partial<T3TeamThreadFacts> = {}): T3TeamThreadFacts {
  return { threadId: ThreadId.make("thread-1"), updatedAt: UPDATED_AT, ...patch };
}

function savedWorkspace() {
  return {
    storedProjects: [
      makeStoredProject({
        workspace: { rootPath: "/workspace/saved", createdAt: "2026-05-01T00:00:00.000Z" },
      }),
    ],
    liveProjects: [makeLiveProject({ id: LIVE_SAVED, workspaceRoot: "/workspace/saved" })],
  };
}

const subagentOf = (parent: string, child: string): Partial<ThreadShell> => ({
  id: ThreadId.make(child),
  lineage: {
    rootThreadId: ThreadId.make(parent),
    parentThreadId: ThreadId.make(parent),
    relationshipToParent: "subagent",
  },
});

describe("mapLiveThreadToProjectThread (V2 shell)", () => {
  it("reads running from the runtime and error from a failed latest run", () => {
    const map = (shell: Partial<ThreadShell>) =>
      mapLiveThreadToProjectThread(makeLiveThreadShell({ projectId: LIVE_SAVED, ...shell }));
    expect(map({ runtime: runtime("running") }).status).toBe("running");
    expect(map({ runtime: runtime("waiting") }).status).toBe("running");
    expect(map({ runtime: runtime("failed") }).status).toBe("error");
    expect(map({ runtime: runtime("completed") }).status).toBe("idle");
    expect(map({ runtime: runtime("completed") }).shellRunStatus).toBe("completed");
    expect(map({ runtime: runtime("starting") }).shellRunStatus).toBe("starting");
    expect(map({ runtime: runtime("starting") }).status).toBe("running");
    expect(map({ runtime: null }).status).toBe("idle");
    expect(map({ runtime: runtime("running"), archivedAt: UPDATED_AT }).status).toBe("completed");
  });

  it("reads background work that outlives the run as running, pending subagents as waiting", () => {
    const shell = (kind: "command" | "subagent") =>
      makeLiveThreadShell({
        projectId: LIVE_SAVED,
        runtime: runtime("idle"),
        pendingBackgroundTasks: [{ kind } as ThreadShell["pendingBackgroundTasks"][number]],
      });
    expect(mapLiveThreadToProjectThread(shell("command")).status).toBe("running");
    const waiting = mapLiveThreadToProjectThread(shell("subagent"));
    expect(waiting.status).toBe("idle");
    expect(waiting.waitingOnChildren).toBe(true);
  });

  it("nests app-owned subagent children under their lineage parent", () => {
    const mapped = mapLiveThreadToProjectThread(
      makeLiveThreadShell({ projectId: LIVE_SAVED, ...subagentOf("thread-parent", "thread-c") }),
    );
    expect(mapped.parentThreadId).toBe("thread-parent");
    expect(
      mapLiveThreadToProjectThread(makeLiveThreadShell({ projectId: LIVE_SAVED })).parentThreadId,
    ).toBeUndefined();
  });

  it("uses the latest run's completion as the last activity instant", () => {
    const mapped = mapLiveThreadToProjectThread(
      makeLiveThreadShell({ projectId: LIVE_SAVED, latestRun: latestRun("completed") }),
    );
    expect(mapped.lastMessageAt).toBe("2026-05-22T09:30:00.000Z");
  });

  it("flags a plan-mode thread that stopped on an actionable plan as awaiting its parent", () => {
    const base = makeLiveThreadShell({
      projectId: LIVE_SAVED,
      interactionMode: "plan",
      latestRun: latestRun("completed"),
      hasActionableProposedPlan: true,
    });
    expect(mapLiveThreadToProjectThread(base).awaitingParent).toBe(true);
    expect(
      mapLiveThreadToProjectThread({ ...base, hasActionableProposedPlan: false }).awaitingParent,
    ).toBeUndefined();
    expect(
      mapLiveThreadToProjectThread({ ...base, interactionMode: "default" }).awaitingParent,
    ).toBeUndefined();
  });

  it("carries the pending-question flag", () => {
    const base = makeLiveThreadShell({ projectId: LIVE_SAVED });
    expect(
      mapLiveThreadToProjectThread({ ...base, hasPendingUserInput: true }).pendingUserInput,
    ).toBe(true);
    expect(mapLiveThreadToProjectThread(base).pendingUserInput).toBe(false);
  });

  it("merges fork thread facts: workflow pills, child status, activity label, retention", () => {
    const mapped = mapLiveThreadToProjectThread(
      makeLiveThreadShell({ projectId: LIVE_SAVED }),
      LIVE_SAVED,
      facts({
        sleepingUntil: "2026-06-15T09:00:00.000Z",
        childStatus: "Writing the migration",
        activityLabel: "editing the retry test",
        retention: "ephemeral",
      }),
    );
    expect(mapped).toMatchObject({
      sleepingUntil: "2026-06-15T09:00:00.000Z",
      childStatus: "Writing the migration",
      activityLabel: "editing the retry test",
      retention: "ephemeral",
    });
    const pill = resolveThreadStatusPill(mapped);
    expect(pill?.label).toBe("Sleeping");
  });

  it("omits fork facts when the thread has none", () => {
    const mapped = mapLiveThreadToProjectThread(makeLiveThreadShell({ projectId: LIVE_SAVED }));
    expect(mapped.sleepingUntil).toBeUndefined();
    expect(mapped).not.toHaveProperty("retention");
    expect(mapped).not.toHaveProperty("childStatus");
  });
});

describe("isListedLiveThread", () => {
  it("hides provider-native subagents and lists app-owned children", () => {
    const child = makeLiveThreadShell(subagentOf("thread-parent", "thread-c"));
    const native = { ...child, source: { ...child.source, creationSource: "provider" as const } };
    expect(isListedLiveThread(child)).toBe(true);
    expect(isListedLiveThread(native)).toBe(false);
  });
});

describe("syncLiveThreadMetadataToLocalState (V2 shell)", () => {
  const sync = (
    liveThreads: ReadonlyArray<ThreadShell>,
    threads = [] as ReturnType<typeof makeProjectThread>[],
  ) => syncLiveThreadMetadataToLocalState({ threads, ...savedWorkspace(), liveThreads });

  it("marks a settled parent as waiting while its lineage child is live", () => {
    const out = sync([
      makeLiveThreadShell({
        id: ThreadId.make("thread-parent"),
        projectId: LIVE_SAVED,
        runtime: runtime("completed"),
      }),
      makeLiveThreadShell({
        projectId: LIVE_SAVED,
        runtime: runtime("running"),
        ...subagentOf("thread-parent", "thread-child"),
      }),
    ]);
    expect(out.find((thread) => thread.id === "thread-parent")?.waitingOnChildren).toBe(true);
    expect(out.find((thread) => thread.id === "thread-child")?.waitingOnChildren).toBe(false);
  });

  it("uses a persisted placement as the relation for children outside the lineage", () => {
    const out = sync(
      [
        makeLiveThreadShell({ id: ThreadId.make("thread-parent"), projectId: LIVE_SAVED }),
        makeLiveThreadShell({
          id: ThreadId.make("thread-child"),
          projectId: LIVE_SAVED,
          runtime: runtime("running"),
        }),
      ],
      [makeProjectThread({ id: "thread-child", parentThreadId: "thread-parent" })],
    );
    expect(out.find((thread) => thread.id === "thread-parent")?.waitingOnChildren).toBe(true);
  });

  it("clears the waiting fact once the child's run is terminal or settled", () => {
    const parent = makeLiveThreadShell({
      id: ThreadId.make("thread-parent"),
      projectId: LIVE_SAVED,
    });
    const child = (patch: Partial<ThreadShell>) =>
      makeLiveThreadShell({
        projectId: LIVE_SAVED,
        ...subagentOf("thread-parent", "thread-child"),
        ...patch,
      });
    for (const done of [
      child({ runtime: runtime("completed") }),
      child({ runtime: runtime("running"), settledOverride: "settled" }),
    ]) {
      const out = sync([parent, done]);
      expect(out.find((thread) => thread.id === "thread-parent")?.waitingOnChildren).toBe(false);
    }
  });

  it("keeps a persisted placement over the lineage parent", () => {
    const out = sync(
      [makeLiveThreadShell({ projectId: LIVE_SAVED, ...subagentOf("thread-parent", "thread-c") })],
      [makeProjectThread({ id: "thread-c", parentThreadId: "thread-launch", ticketId: "PROJ-1" })],
    );
    expect(out).toEqual([
      expect.objectContaining({
        id: "thread-c",
        parentThreadId: "thread-launch",
        ticketId: "PROJ-1",
      }),
    ]);
  });
});
