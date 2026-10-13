import { EnvironmentId, ThreadId } from "@t3tools/contracts";
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
vi.mock("~/components/ui/toast", () => ({ toastManager: { add: vi.fn() } }));

import { awaitSuccessorLive } from "./t3team-threadHandoffWeb";

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
  registry.shells.clear();
  registry.listeners.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("awaitSuccessorLive", () => {
  it("stays pending through preparing and starting, resolves once the run is running", async () => {
    const state = settledState(awaitSuccessorLive(ENV, THREAD, 60_000));
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
    const state = settledState(awaitSuccessorLive(ENV, THREAD, 60_000));
    registry.setShell(THREAD, { status: "preparing", latestRunId: "run-1" });
    registry.setShell(THREAD, { status: "failed", latestRunId: "run-1" });
    await vi.waitFor(() => expect(state.value).toBe("rejected"));
    expect(state.error).toBe("The new thread's first run did not start.");
    expect(registry.listeners.size).toBe(0);
  });

  it("rejects on timeout while the run is still preparing", async () => {
    const state = settledState(awaitSuccessorLive(ENV, THREAD, 1_000));
    registry.setShell(THREAD, { status: "preparing", latestRunId: "run-1" });
    vi.advanceTimersByTime(1_000);
    await vi.waitFor(() => expect(state.value).toBe("rejected"));
    expect(state.error).toBe("The new thread did not start in time.");
  });

  it("resolves at once when the shell is already live", async () => {
    registry.setShell(THREAD, { status: "completed", latestRunId: "run-1" });
    const state = settledState(awaitSuccessorLive(ENV, THREAD, 1_000));
    await vi.waitFor(() => expect(state.value).toBe("resolved"));
  });
});
