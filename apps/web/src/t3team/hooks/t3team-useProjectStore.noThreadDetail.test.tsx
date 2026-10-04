// @vitest-environment jsdom
/**
 * Regression (2026-09-29 subscribe churn): the t3team project store must build its live thread
 * list from thread SHELLS only. Reading a thread's detail per row (`appAtomRegistry.get(
 * detailAtom(ref))`) opens a `subscribeThread` stream that the idle TTL closes 5 s later and the
 * next shell update reopens: 5.6 subscriptions a second on a real install.
 *
 * `detailAtom` is the single entry point to a thread's detail stream, so any per-row detail read
 * — whichever hook it lives in — has to call it. The spy fails the test if one is reintroduced.
 */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThreadId } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { ThreadShell } from "~/types";

import { makeLiveThreadShell } from "./t3team-threadBridge.testSupport";

const harness = vi.hoisted(() => ({
  shells: [] as unknown[],
  detailAtom: vi.fn(),
  threadShellAtom: vi.fn(),
  shellReads: 0,
}));

vi.mock("~/localApi", () => ({ readLocalApi: () => null }));
vi.mock("~/state/environments", () => ({ usePrimaryEnvironmentId: () => null }));
vi.mock("~/state/entities", () => ({
  useProjects: () => [],
  useThreadShells: () => {
    harness.shellReads += 1;
    return harness.shells;
  },
  // Present so a reintroduced per-row read is not masked by a missing export.
  useThreadRefs: () => [],
}));
vi.mock("~/state/threads", () => ({
  environmentThreadShells: { threadShellAtom: harness.threadShellAtom },
  environmentThreadDetails: { detailAtom: harness.detailAtom },
}));
vi.mock("~/t3team/backend/t3team-index", () => ({
  useBackend: () => null,
  useBackendState: () => ({ connectionStatus: "disconnected" as const }),
}));

import { useProjectStore } from "./t3team-useProjectStore";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SHELL_COUNT = 25;

function makeShells(count: number): ThreadShell[] {
  return Array.from({ length: count }, (_, index) =>
    makeLiveThreadShell({ id: ThreadId.make(`thread-${index}`), title: `Thread ${index}` }),
  );
}

describe("useProjectStore live source", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    harness.shells = [];
    harness.shellReads = 0;
    // Real atoms, so a reintroduced read fails on the assertions below rather than by crashing.
    harness.detailAtom.mockReset().mockImplementation(() => Atom.make<unknown>(() => null));
    harness.threadShellAtom.mockReset().mockImplementation(() => Atom.make<unknown>(() => null));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("syncs N live shells into the store without reading any thread detail", async () => {
    harness.shells = makeShells(SHELL_COUNT);
    let store: ReturnType<typeof useProjectStore> | null = null;

    function Probe() {
      const value = useProjectStore();
      useEffect(() => {
        store = value;
      });
      return null;
    }

    await act(async () => {
      root.render(<Probe />);
    });
    // A shell update (fresh array identity, like every shell stream event) must not open a
    // detail read either.
    harness.shells = makeShells(SHELL_COUNT);
    await act(async () => {
      root.render(<Probe />);
    });

    expect(harness.shellReads, "the store reads the shell list").toBeGreaterThan(0);
    expect(
      store!.threads.map((thread) => thread.id).toSorted(),
      "every shell reached the store",
    ).toEqual(
      makeShells(SHELL_COUNT)
        .map((shell) => shell.id)
        .toSorted(),
    );
    expect(harness.detailAtom, "no per-row thread-detail stream").not.toHaveBeenCalled();
    expect(harness.threadShellAtom).not.toHaveBeenCalled();
  });
});
