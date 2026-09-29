// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Project, ThreadShell } from "~/types";
import type { ProjectThread } from "~/t3team/t3team-types";
import { createMockBackend } from "~/t3team/backend/t3team-mockBackend";
import type { BackendApi } from "~/t3team/backend/t3team-types";

const backendRef: { current: BackendApi | null } = { current: null };

vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => backendRef.current,
  useBackendState: () => ({ connectionStatus: "connected" as const }),
}));

import { makeLiveThreadShell } from "./t3team-threadBridge.testSupport";
import { useHydrateThreadPlacements } from "./t3team-useHydrateThreadPlacements";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LIVE_THREAD: ThreadShell = makeLiveThreadShell({
  id: ThreadId.make("thread-missing"),
  projectId: ProjectId.make("live-project"),
});

// Held at module scope (not recreated inside the component) so re-renders
// exercise the real-world case: the caller's arrays are referentially
// stable across an unrelated re-render, and only `candidateThreadIds` (a
// value freshly derived every render inside the hook) would otherwise
// differ.
const LIVE_THREADS: ReadonlyArray<ThreadShell> = [LIVE_THREAD];
const EMPTY_PROJECT_THREADS: ProjectThread[] = [];
const EMPTY_PROJECTS: Project[] = [];
const EMPTY_STORED_PROJECTS: ReadonlyArray<never> = [];
const NOOP_SET_THREADS = () => {};

function renderProbe() {
  const host = document.createElement("div");
  let root: Root;
  let forceRerender: () => void = () => {};

  function Probe() {
    const [, setTick] = useState(0);
    forceRerender = () => setTick((value) => value + 1);
    useHydrateThreadPlacements({
      threads: EMPTY_PROJECT_THREADS,
      setThreads: NOOP_SET_THREADS,
      storedProjects: EMPTY_STORED_PROJECTS,
      liveProjects: EMPTY_PROJECTS,
      liveThreads: LIVE_THREADS,
    });
    return null;
  }

  act(() => {
    root = createRoot(host);
    root.render(createElement(Probe));
  });

  return {
    rerender: () => act(() => forceRerender()),
    unmount: () => act(() => root.unmount()),
  };
}

describe("useHydrateThreadPlacements effect scheduling", () => {
  let listThreadPlacements: ReturnType<typeof vi.fn<BackendApi["listThreadPlacements"]>>;

  beforeEach(() => {
    listThreadPlacements = vi.fn<BackendApi["listThreadPlacements"]>().mockResolvedValue([]);
    const baseBackend = createMockBackend();
    backendRef.current = {
      ...baseBackend,
      listThreadPlacements,
    };
  });

  it("posts once for an unchanged candidate set across re-renders", async () => {
    const rendered = renderProbe();

    await act(async () => {
      await Promise.resolve();
    });
    expect(listThreadPlacements).toHaveBeenCalledTimes(1);
    expect(listThreadPlacements).toHaveBeenCalledWith({
      threadIds: [ThreadId.make("thread-missing")],
    });

    // Re-rendering with the exact same `liveThreads`/`threads` inputs
    // produces a fresh `candidateThreadIds` array identity each time, but the
    // *content* (and therefore `candidateThreadIdsKey`) is unchanged. The
    // effect must not fire again.
    rendered.rerender();
    rendered.rerender();
    await act(async () => {
      await Promise.resolve();
    });

    expect(listThreadPlacements).toHaveBeenCalledTimes(1);

    rendered.unmount();
  });

  it("does not re-request ids the server already answered with no placement (GHE #382)", async () => {
    const otherThread = { ...LIVE_THREAD, id: ThreadId.make("thread-other") };
    let liveThreads: ReadonlyArray<ThreadShell> = [LIVE_THREAD];
    const host = document.createElement("div");
    let root: Root;
    let setLive: (threads: ReadonlyArray<ThreadShell>) => void = () => {};

    function Probe() {
      const [threads, setThreads] = useState(liveThreads);
      setLive = setThreads;
      useHydrateThreadPlacements({
        threads: EMPTY_PROJECT_THREADS,
        setThreads: NOOP_SET_THREADS,
        storedProjects: EMPTY_STORED_PROJECTS,
        liveProjects: EMPTY_PROJECTS,
        liveThreads: threads,
      });
      return null;
    }

    act(() => {
      root = createRoot(host);
      root.render(createElement(Probe));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(listThreadPlacements).toHaveBeenCalledTimes(1);
    expect(listThreadPlacements).toHaveBeenLastCalledWith({
      threadIds: [ThreadId.make("thread-missing")],
    });

    // A new live thread changes the candidate set. The already-answered id
    // must be dropped from the request; only the new id goes to the server.
    liveThreads = [LIVE_THREAD, otherThread];
    act(() => setLive(liveThreads));
    await act(async () => {
      await Promise.resolve();
    });
    expect(listThreadPlacements).toHaveBeenCalledTimes(2);
    expect(listThreadPlacements).toHaveBeenLastCalledWith({
      threadIds: [ThreadId.make("thread-other")],
    });

    act(() => root.unmount());
  });

  it("ignores live-array identity flapping and only re-fetches on content change (GHE #382)", async () => {
    // The shell derives `liveThreads`/`liveProjects` fresh on every live
    // event — new array and object identity even when nothing changed. The
    // fetch decision may only depend on the content, or every live update
    // re-fires the placements POST (the 778-POST-in-12-min flapping on the
    // live machine).
    let liveThreads: ReadonlyArray<ThreadShell> = [LIVE_THREAD];
    let liveProjects: ReadonlyArray<Project> = [];
    const host = document.createElement("div");
    let root: Root;
    let setLive: (threads: ReadonlyArray<ThreadShell>) => void = () => {};
    let setProjects: (projects: ReadonlyArray<Project>) => void = () => {};

    function Probe() {
      const [threads, setThreadsState] = useState(liveThreads);
      const [projects, setProjectsState] = useState(liveProjects);
      setLive = setThreadsState;
      setProjects = setProjectsState;
      useHydrateThreadPlacements({
        threads: EMPTY_PROJECT_THREADS,
        setThreads: NOOP_SET_THREADS,
        storedProjects: EMPTY_STORED_PROJECTS,
        liveProjects: projects,
        liveThreads: threads,
      });
      return null;
    }

    act(() => {
      root = createRoot(host);
      root.render(createElement(Probe));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(listThreadPlacements).toHaveBeenCalledTimes(1);

    // Fresh array identity, identical content: no re-fetch.
    act(() => setLive([LIVE_THREAD]));
    await act(async () => {
      await Promise.resolve();
    });
    expect(listThreadPlacements).toHaveBeenCalledTimes(1);

    // A fresh `liveProjects` array with identical content: still no re-fetch.
    liveProjects = [];
    act(() => setProjects(liveProjects));
    await act(async () => {
      await Promise.resolve();
    });
    expect(listThreadPlacements).toHaveBeenCalledTimes(1);

    // A real content change (the thread's `updatedAt` advanced) makes the id
    // eligible again: the effect must fire.
    act(() => setLive([{ ...LIVE_THREAD, updatedAt: "2026-05-22T11:00:00.000Z" }]));
    await act(async () => {
      await Promise.resolve();
    });
    expect(listThreadPlacements).toHaveBeenCalledTimes(2);
    expect(listThreadPlacements).toHaveBeenLastCalledWith({
      threadIds: [ThreadId.make("thread-missing")],
    });

    act(() => root.unmount());
  });
});
