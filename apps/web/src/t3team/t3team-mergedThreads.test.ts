// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { Atom } from "effect/unstable/reactivity";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  EnvironmentThread,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// Shared, mutable fixtures. Each holder's `current` is what the mocked source
// atom reads on every registry access — mirroring how the real shell-source
// atoms update in place when a `thread-upserted` event arrives.
const entitiesHarness = vi.hoisted(() => ({
  refs: [] as Array<{ environmentId: string; threadId: string }>,
  shells: [] as unknown[],
}));

const shellHolders = vi.hoisted(() => new Map<string, { current: unknown }>());
const detailHolders = vi.hoisted(() => new Map<string, { current: unknown }>());

vi.mock("~/state/entities", () => ({
  useThreadRefs: () => entitiesHarness.refs,
  useThreadShells: () => entitiesHarness.shells,
}));

vi.mock("~/state/threads", () => {
  const holderFor = (
    holders: Map<string, { current: unknown }>,
    ref: { environmentId: string; threadId: string },
  ) => {
    const key = `${ref.environmentId}:${ref.threadId}`;
    let holder = holders.get(key);
    if (!holder) {
      holder = { current: null };
      holders.set(key, holder);
    }
    return holder;
  };
  return {
    environmentThreadShells: {
      threadShellAtom: (ref: { environmentId: string; threadId: string }) =>
        Atom.make<unknown>(() => holderFor(shellHolders, ref).current),
    },
    environmentThreadDetails: {
      detailAtom: (ref: { environmentId: string; threadId: string }) =>
        Atom.make<unknown>(() => holderFor(detailHolders, ref).current),
    },
  };
});

import { resetAppAtomRegistryForTests } from "~/rpc/atomRegistry";
import { useMergedThreads } from "./t3team-mergedThreads";

const REF = {
  environmentId: "env-test",
  threadId: "thread-child",
} as { environmentId: string; threadId: string };

const REF_KEY = `${REF.environmentId}:${REF.threadId}`;

function setShell(status: string, activityState: string | null): EnvironmentThreadShell {
  const shell = {
    environmentId: "env-test",
    id: "thread-child",
    projectId: "project-test",
    title: "Child thread",
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
    session: {
      threadId: "thread-child",
      status,
      providerName: null,
      runtimeMode: "full-access",
      activeTurnId: null,
      lastError: null,
      updatedAt: "2026-01-01T00:00:01.000Z",
    },
    activityState,
  } as unknown as EnvironmentThreadShell;
  shellHolders.set(REF_KEY, { current: shell });
  return shell;
}

interface Probe {
  readonly merged: () => ReadonlyArray<EnvironmentThread>;
  readonly bump: () => void;
  readonly unmount: () => void;
}

function mountProbe(): Probe {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: ReadonlyArray<EnvironmentThread> = [];
  let bump: () => void = () => {};
  function MergedThreadsProbe() {
    const [, force] = useState(0);
    bump = () => force((n) => n + 1);
    latest = useMergedThreads();
    return null;
  }
  act(() => {
    root.render(createElement(MergedThreadsProbe));
  });
  return {
    merged: () => latest,
    bump: () => act(() => bump()),
    unmount: () => act(() => root.unmount()),
  };
}

describe("useMergedThreads (GHE #234 live status)", () => {
  beforeEach(() => {
    resetAppAtomRegistryForTests();
    entitiesHarness.refs = [REF];
    entitiesHarness.shells = [];
    shellHolders.clear();
    detailHolders.clear();
  });

  it("updates child status in real time when the shell list changes with refs unchanged", () => {
    setShell("running", "working");
    entitiesHarness.shells = [shellHolders.get(REF_KEY)!.current as EnvironmentThreadShell];

    const probe = mountProbe();
    try {
      let thread = probe.merged()[0];
      expect(thread).toBeDefined();
      const initialStatus = thread?.session?.status;
      const initialActivity = thread?.activityState;
      expect(initialStatus).toBe("running");
      expect(initialActivity).toBe("working");

      // running → waiting (status-change event; refs keep their identity)
      setShell("interrupted", "waiting");
      entitiesHarness.shells = [shellHolders.get(REF_KEY)!.current as EnvironmentThreadShell];
      probe.bump();
      thread = probe.merged()[0];
      const waitingStatus = thread?.session?.status;
      const waitingActivity = thread?.activityState;
      expect(waitingStatus).toBe("interrupted");
      expect(waitingActivity).toBe("waiting");

      // waiting → terminal (turn settled)
      setShell("stopped", null);
      entitiesHarness.shells = [shellHolders.get(REF_KEY)!.current as EnvironmentThreadShell];
      probe.bump();
      thread = probe.merged()[0];
      const stoppedStatus = thread?.session?.status;
      const stoppedActivity = thread?.activityState;
      expect(stoppedStatus).toBe("stopped");
      expect(stoppedActivity).toBe(null);
    } finally {
      probe.unmount();
    }
  });

  it("does not recompute when the shell list keeps its referential identity", () => {
    setShell("running", "working");
    entitiesHarness.shells = [shellHolders.get(REF_KEY)!.current as EnvironmentThreadShell];

    const probe = mountProbe();
    const first = probe.merged();
    try {
      // Same array identity (referentially stable snapshot) → same result.
      probe.bump();
      expect(probe.merged()).toBe(first);
    } finally {
      probe.unmount();
    }
  });
});
