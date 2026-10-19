import { runThreadHandoff } from "@t3tools/client-runtime/state/thread-handoff";
import { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// A stand-in registry: one thread index whose shells the test advances by hand.
const registry = vi.hoisted(() => {
  const shells = new Map<string, unknown>();
  const listeners = new Set<() => void>();
  return {
    shells,
    listeners,
    setShell(threadId: string, shell: unknown) {
      shells.set(threadId, shell);
      for (const listener of listeners) listener();
    },
  };
});

vi.mock("~/rpc/atomRegistry", () => ({
  appAtomRegistry: {
    get: () => registry.shells,
    subscribe: (_atom: unknown, listener: () => void) => {
      registry.listeners.add(listener);
      return () => registry.listeners.delete(listener);
    },
  },
}));
vi.mock("~/state/threads", () => ({
  environmentThreadShells: { environmentThreadIndexAtom: () => "index-atom" },
}));
const toastAdd = vi.hoisted(() => vi.fn());
vi.mock("~/components/ui/toast", () => ({ toastManager: { add: toastAdd } }));
vi.mock("~/lib/utils", () => ({ newMessageId: () => "message-1" }));

import {
  awaitSuccessorLive,
  stopSuccessor,
  SUCCESSOR_LIVE_BOUNDS,
} from "./t3team-threadHandoffSuccessorLive";
import { announceThreadHandoff } from "./t3team-threadHandoffWeb";

const BOUNDS = { preparingMs: 60_000, startingMs: 1_000 };
const MINUTE = 60_000;

const ENV = EnvironmentId.make("env-cloud");
const THREAD = ThreadId.make("thread-successor");

const settledState = (promise: Promise<void>) => {
  const state = { value: "pending" as "pending" | "resolved" | "rejected", error: "" };
  promise.then(
    () => {
      state.value = "resolved";
    },
    (error: Error) => {
      state.value = "rejected";
      state.error = error.message;
    },
  );
  return state;
};

beforeEach(() => {
  toastAdd.mockClear();
  registry.shells.clear();
  registry.listeners.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("awaitSuccessorLive", () => {
  it("stays pending through preparing and starting, resolves once the run is running", async () => {
    const state = settledState(awaitSuccessorLive(ENV, THREAD, BOUNDS));
    registry.setShell(THREAD, { status: "preparing", latestRunId: "run-1" });
    await Promise.resolve();
    expect(state.value).toBe("pending");
    registry.setShell(THREAD, { status: "starting", latestRunId: "run-1" });
    await Promise.resolve();
    expect(state.value).toBe("pending");
    registry.setShell(THREAD, { status: "running", latestRunId: "run-1" });
    await vi.waitFor(() => expect(state.value).toBe("resolved"));
    expect(registry.listeners.size).toBe(0);
  });

  it("rejects when the first run fails during preparation", async () => {
    const state = settledState(awaitSuccessorLive(ENV, THREAD, BOUNDS));
    registry.setShell(THREAD, { status: "preparing", latestRunId: "run-1" });
    registry.setShell(THREAD, { status: "failed", latestRunId: "run-1" });
    await vi.waitFor(() => expect(state.value).toBe("rejected"));
    expect(state.error).toBe("The new thread's first run did not start.");
    expect(registry.listeners.size).toBe(0);
  });

  it("gives a preparing run 10 minutes, not the 2-minute start bound", async () => {
    const state = settledState(awaitSuccessorLive(ENV, THREAD));
    registry.setShell(THREAD, { status: "preparing", latestRunId: "run-1" });
    await vi.advanceTimersByTimeAsync(9 * MINUTE);
    expect(state.value).toBe("pending");
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(state.value).toBe("rejected");
    expect(state.error).toBe("The new thread was still preparing its workspace.");
    expect(SUCCESSOR_LIVE_BOUNDS).toEqual({ preparingMs: 10 * MINUTE, startingMs: 2 * MINUTE });
  });

  it("resolves when a long preparation goes running inside the bound", async () => {
    const state = settledState(awaitSuccessorLive(ENV, THREAD));
    registry.setShell(THREAD, { status: "preparing", latestRunId: "run-1" });
    await vi.advanceTimersByTimeAsync(8 * MINUTE);
    registry.setShell(THREAD, { status: "starting", latestRunId: "run-1" });
    await vi.advanceTimersByTimeAsync(MINUTE);
    registry.setShell(THREAD, { status: "running", latestRunId: "run-1" });
    await vi.waitFor(() => expect(state.value).toBe("resolved"));
  });

  it("gives the provider turn the start bound from when preparation ended", async () => {
    const state = settledState(awaitSuccessorLive(ENV, THREAD, BOUNDS));
    registry.setShell(THREAD, { status: "preparing", latestRunId: "run-1" });
    await vi.advanceTimersByTimeAsync(50_000);
    registry.setShell(THREAD, { status: "starting", latestRunId: "run-1" });
    await vi.advanceTimersByTimeAsync(999);
    expect(state.value).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(state.value).toBe("rejected");
    expect(state.error).toBe("The new thread did not start in time.");
  });

  it("resolves at once when the shell is already live", async () => {
    registry.setShell(THREAD, { status: "completed", latestRunId: "run-1" });
    const state = settledState(awaitSuccessorLive(ENV, THREAD, BOUNDS));
    await vi.waitFor(() => expect(state.value).toBe("resolved"));
  });
});

describe("a successor that never goes live", () => {
  const capture = {
    threadId: "thread-source",
    title: "Upload retry",
    branch: "feature/upload-retry",
    activeRunId: "run-source",
    summaryText: "summary",
    branchState: null,
    refusals: [],
    capturedAt: "2026-10-13T00:00:00.000Z",
  } as never;
  const handoff = (interrupt: (runId: RunId) => Promise<void>, launch: () => void) => {
    const sourceMutations: string[] = [];
    const outcome = runThreadHandoff({
      source: {
        environmentId: EnvironmentId.make("env-local"),
        threadId: ThreadId.make("t"),
        label: "This device",
      },
      successor: { environmentId: ENV, threadId: THREAD, label: "nexi-cloud-1" },
      turnMode: "interrupt",
      steps: {
        capture: async () => capture,
        launchSuccessor: async () => launch(),
        awaitSuccessorLive: () => awaitSuccessorLive(ENV, THREAD, BOUNDS),
        stopSuccessor: () => stopSuccessor(ENV, THREAD, interrupt),
        interruptSource: async () => void sourceMutations.push("interrupt"),
        record: async () => void sourceMutations.push("record"),
      },
    });
    return { outcome, sourceMutations };
  };

  it("interrupts the successor's run when the bound fires, and leaves the source alone", async () => {
    const interrupt = vi.fn(async (_runId: RunId) => {});
    const { outcome, sourceMutations } = handoff(interrupt, () =>
      registry.setShell(THREAD, { status: "preparing", latestRunId: "run-successor" }),
    );
    await vi.advanceTimersByTimeAsync(BOUNDS.preparingMs);
    await expect(outcome).resolves.toMatchObject({ stage: "verify", successorStopped: true });
    expect(interrupt).toHaveBeenCalledWith("run-successor");
    expect(sourceMutations).toEqual([]);
  });

  it("warns against retrying when the successor's run is not visible to stop", async () => {
    const interrupt = vi.fn(async (_runId: RunId) => {});
    const { outcome } = handoff(interrupt, () => {});
    await vi.advanceTimersByTimeAsync(BOUNDS.startingMs);
    const result = await outcome;
    expect(result).toMatchObject({ stage: "verify", successorStopped: false });
    expect(interrupt).not.toHaveBeenCalled();
    const open = vi.fn();
    announceThreadHandoff(result, "nexi-cloud-1", open);
    const toast = toastAdd.mock.calls[0]?.[0];
    expect(toast.description).toContain("could start the work twice");
    expect(toast.description).not.toContain("try again");
    toast.actionProps.onClick();
    expect(open).toHaveBeenCalled();
  });

  it("needs no interrupt when the successor's run already failed", async () => {
    const interrupt = vi.fn(async (_runId: RunId) => {});
    registry.setShell(THREAD, { status: "failed", latestRunId: "run-successor" });
    await expect(stopSuccessor(ENV, THREAD, interrupt)).resolves.toBe(true);
    expect(interrupt).not.toHaveBeenCalled();
  });
});
