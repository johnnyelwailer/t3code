// @vitest-environment jsdom
/**
 * GHE #52 — regression: the active-children indicator must track a child
 * thread's live run state, end to end, without the child ever being opened.
 *
 * The chain under test is the real client path:
 *   `thread-upserted` shell stream event → `applyShellStreamEvent` (the same
 *   reducer the WS shell subscription drives) → live shell list →
 *   `useMergedThreads` (GHE #234) → `syncLiveThreadMetadataToLocalState` +
 *   `mapLiveThreadToProjectThread` (status mapping) →
 *   `buildChildThreadRelations` (parent/child relation) →
 *   `mergeActiveAgentsAndChildren` (the working-row dots).
 *
 * Before the fix, a child whose turn was in flight without a live provider
 * session (`latestTurn.state === "running"`, session idle/absent) — and one
 * alive only through native background liveness — mapped to status "idle" and
 * never lit a dot, no matter how fresh the shell events were.
 */
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  OrchestrationShellSnapshot,
  OrchestrationShellStreamEvent,
  OrchestrationThreadShell,
} from "@t3tools/contracts";
import { applyShellStreamEvent } from "@t3tools/client-runtime/state/shell";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";

import { mergeActiveAgentsAndChildren } from "~/t3team/chat/t3team-activeAgentsCore";
import { buildChildThreadRelations } from "~/t3team/hooks/t3team-childThreadRelationsCore";
import { syncLiveThreadMetadataToLocalState } from "~/t3team/hooks/t3team-threadBridge";
import { makeProjectThread } from "~/t3team/hooks/t3team-threadBridge.testSupport";
import { useThreadShells } from "~/state/entities";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const entitiesHarness = vi.hoisted(() => ({
  shells: [] as unknown[],
}));

vi.mock("~/state/entities", () => ({
  useThreadShells: () => entitiesHarness.shells,
}));

// ---------------------------------------------------------------------------

function baseShell(overrides: Record<string, unknown> = {}): OrchestrationThreadShell {
  return {
    id: "thread-child",
    projectId: "project-test",
    title: "Investigate regression",
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    session: null,
    latestUserMessageAt: null,
    ...overrides,
  } as unknown as OrchestrationThreadShell;
}

function upsert(sequence: number, thread: OrchestrationThreadShell): OrchestrationShellStreamEvent {
  return { kind: "thread-upserted", sequence, thread } as OrchestrationShellStreamEvent;
}

const initialSnapshot: OrchestrationShellSnapshot = {
  projects: [],
  threads: [
    baseShell({ id: "thread-parent", title: "Parent orchestration" }),
    baseShell({ id: "thread-child", title: "Investigate regression" }),
  ],
  snapshotSequence: 0,
} as unknown as OrchestrationShellSnapshot;

const EMPTY_PANEL_MODEL = {
  workflows: [],
  directAgents: [],
  runningCount: 0,
  waitingCount: 0,
  idleCount: 0,
  settledCount: 0,
  totalTokens: 0,
  hasAgents: false,
  liveCount: 0,
} as never;

const LOCAL_THREADS = [
  makeProjectThread({ id: "thread-parent", projectId: "project-test" }),
  makeProjectThread({
    id: "thread-child",
    projectId: "project-test",
    parentThreadId: "thread-parent",
  }),
];

interface IndicatorProbe {
  readonly entries: () => ReturnType<typeof mergeActiveAgentsAndChildren>;
  readonly push: (event: OrchestrationShellStreamEvent) => void;
  readonly unmount: () => void;
}

function mountIndicatorProbe(initial: OrchestrationShellSnapshot): IndicatorProbe {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let latest = mergeActiveAgentsAndChildren({
    childThreads: [],
    agentPanelModel: EMPTY_PANEL_MODEL,
  });
  let pushEvent: (event: OrchestrationShellStreamEvent) => void = () => {};

  function Probe() {
    const [snapshot, setSnapshot] = useState<OrchestrationShellSnapshot>(initial);
    pushEvent = (event) => {
      // The same application the live WS shell subscription performs:
      // sequence-gated, in-place snapshot update.
      setSnapshot((current) =>
        event.sequence > current.snapshotSequence ? applyShellStreamEvent(current, event) : current,
      );
    };
    entitiesHarness.shells = snapshot.threads as never[];
    const liveThreads = useThreadShells();

    // The project-store sync step: live shells → local ProjectThreads (status
    // mapping). The parent/child relation is the durable placement already in
    // local state (hydrated from the server placement route), never a shell field.
    const projectThreads = syncLiveThreadMetadataToLocalState({
      threads: LOCAL_THREADS,
      storedProjects: [],
      liveProjects: [],
      liveThreads,
    });
    const relations = buildChildThreadRelations(projectThreads);
    const childThreads = relations.childThreadsByParentId.get("thread-parent") ?? [];
    latest = mergeActiveAgentsAndChildren({
      childThreads,
      agentPanelModel: EMPTY_PANEL_MODEL,
    });
    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    entries: () => latest,
    push: (event) => act(() => pushEvent(event)),
    unmount: () => act(() => root.unmount()),
  };
}

// ---------------------------------------------------------------------------

describe("active-children indicator live sync (GHE #52)", () => {
  it("lights the child dot when the turn goes in-flight and clears it when it settles — without opening the child", () => {
    const probe = mountIndicatorProbe(initialSnapshot);
    try {
      // Child idle → no active agents.
      expect(probe.entries()).toEqual([]);

      // Live event: child turn in flight, provider session not (yet) registered.
      const turnInFlight = baseShell({
        id: "thread-child",
        title: "Investigate regression",
        latestTurn: { state: "running", startedAt: "2026-01-01T01:00:00.000Z" },
        session: null,
        activityLabel: "Investigating regression",
        childStatusUpdatedAt: "2026-01-01T01:00:00.000Z",
      });
      probe.push(upsert(1, turnInFlight));

      const running = probe.entries();
      expect(running.map((entry) => entry.id)).toEqual(["child:thread-child"]);
      expect(running[0]?.statusLabel).toBe("Investigating regression");

      // Live event: turn settles, session idles, no background liveness → dot clears.
      const settled = baseShell({
        id: "thread-child",
        title: "Investigate regression",
        latestTurn: { state: "completed", completedAt: "2026-01-01T01:05:00.000Z" },
        session: null,
        activityLabel: null,
      });
      probe.push(upsert(2, settled));

      expect(probe.entries()).toEqual([]);
    } finally {
      probe.unmount();
    }
  });

  it("keeps the dot lit for native background liveness after the turn settles", () => {
    const probe = mountIndicatorProbe(initialSnapshot);
    try {
      const settledButLive = baseShell({
        id: "thread-child",
        title: "Investigate regression",
        latestTurn: { state: "completed", completedAt: "2026-01-01T01:05:00.000Z" },
        session: null,
        backgroundLiveness: "working",
        activityLabel: "Running background checks",
      });
      probe.push(upsert(1, settledButLive));

      expect(probe.entries().map((entry) => entry.id)).toEqual(["child:thread-child"]);
    } finally {
      probe.unmount();
    }
  });
});
