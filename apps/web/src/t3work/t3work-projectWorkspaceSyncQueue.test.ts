import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  enqueueProjectWorkspaceSync,
  getProjectWorkspaceSyncStatus,
  resetProjectWorkspaceSyncQueueForTests,
  retainProjectWorkspaceSync,
} from "./t3work-projectWorkspaceSyncQueue";

beforeEach(() => {
  vi.useFakeTimers();
  resetProjectWorkspaceSyncQueueForTests();
});

afterEach(() => {
  resetProjectWorkspaceSyncQueueForTests();
  vi.useRealTimers();
});

describe("project workspace sync queue release path", () => {
  it("clears the pending flush timer and drops the state when the last lease releases", async () => {
    const workspaceRoot = "/workspace/a";
    const release = retainProjectWorkspaceSync(workspaceRoot);
    const run = vi.fn().mockResolvedValue(undefined);

    // Enqueue a debounced sync but never let it flush.
    void enqueueProjectWorkspaceSync({
      workspaceRoot,
      signature: "sig-1",
      run,
      debounceMs: 150,
    }).catch(() => {
      // Expected: released before the flush ever runs.
    });

    release();

    // Advance well past the debounce window; if the flush timer had not been
    // cleared, `run` would fire here after all consumers unmounted.
    await vi.advanceTimersByTimeAsync(1_000);

    expect(run).not.toHaveBeenCalled();
    expect(getProjectWorkspaceSyncStatus(workspaceRoot)).toEqual({ status: "idle" });
  });

  it("rejects dangling waiters instead of leaving their promises unsettled", async () => {
    const workspaceRoot = "/workspace/b";
    const release = retainProjectWorkspaceSync(workspaceRoot);
    const run = vi.fn().mockResolvedValue(undefined);

    const pending = enqueueProjectWorkspaceSync({
      workspaceRoot,
      signature: "sig-1",
      run,
      debounceMs: 150,
    });

    release();

    await expect(pending).rejects.toThrow(/no active consumers/i);
    expect(run).not.toHaveBeenCalled();
  });

  it("still lets an in-flight sync settle its waiters after the last lease releases", async () => {
    const workspaceRoot = "/workspace/c";
    const release = retainProjectWorkspaceSync(workspaceRoot);
    let resolveRun: (() => void) | undefined;
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve;
        }),
    );

    const pending = enqueueProjectWorkspaceSync({
      workspaceRoot,
      signature: "sig-1",
      run,
      debounceMs: 0,
    });

    // Let the debounce fire so the run is in-flight before releasing.
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);

    release();

    resolveRun?.();
    await expect(pending).resolves.toBeUndefined();
  });
});
