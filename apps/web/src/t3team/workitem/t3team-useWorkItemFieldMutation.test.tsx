/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  useWorkItemFieldMutation,
  WORK_ITEM_FIELD_UNDO_WINDOW_MS,
  type WorkItemFieldMutationResult,
} from "./t3team-useWorkItemFieldMutation";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("useWorkItemFieldMutation", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    host?.remove();
    root = null;
    host = null;
  });

  function mount<TValue>(
    initialProps: {
      readonly value: TValue;
      readonly mutate: (nextValue: TValue) => Promise<void>;
    },
  ): {
    readonly latest: { result: WorkItemFieldMutationResult<TValue> | null };
    readonly render: (value: TValue) => Promise<void>;
  } {
    const latest: { result: WorkItemFieldMutationResult<TValue> | null } = { result: null };

    function Harness({ value }: { value: TValue }) {
      latest.result = useWorkItemFieldMutation<TValue>({
        value,
        mutate: initialProps.mutate,
        action: "testing",
      });
      return null;
    }

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const render = async (value: TValue) => {
      await act(async () => {
        root?.render(<Harness value={value} />);
      });
    };

    return { latest, render };
  }

  it("applies the value optimistically before the mutation resolves", async () => {
    let resolveMutate: (() => void) | undefined;
    const { latest, render } = mount<string>({
      value: "To Do",
      mutate: () =>
        new Promise((resolve) => {
          resolveMutate = resolve;
        }),
    });

    await render("To Do");
    expect(latest.result?.value).toBe("To Do");

    act(() => {
      latest.result?.commit("Done");
    });

    expect(latest.result?.value).toBe("Done");
    expect(latest.result?.pending).toBe(true);

    await act(async () => {
      resolveMutate?.();
      await Promise.resolve();
    });
    expect(latest.result?.pending).toBe(false);
    expect(latest.result?.value).toBe("Done");
    expect(latest.result?.error).toBeNull();
  });

  it("rolls back to the committed value when the mutation fails", async () => {
    const { latest, render } = mount<string>({
      value: "To Do",
      mutate: () => Promise.reject(new Error("Request failed with 500")),
    });

    await render("To Do");

    await act(async () => {
      latest.result?.commit("Done");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latest.result?.value).toBe("To Do");
    expect(latest.result?.pending).toBe(false);
    expect(latest.result?.error).not.toBeNull();
    expect(latest.result?.error?.canRetry).toBe(true);
  });

  it("does not let a slow, superseded request clobber a newer optimistic value on success", async () => {
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    let callCount = 0;
    const { latest, render } = mount<string>({
      value: "To Do",
      mutate: () => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise((resolve) => {
            resolveFirst = resolve;
          });
        }
        return new Promise((resolve) => {
          resolveSecond = resolve;
        });
      },
    });

    await render("To Do");

    act(() => {
      latest.result?.commit("In Progress"); // slow, never resolves until we say so
    });
    expect(latest.result?.value).toBe("In Progress");

    act(() => {
      latest.result?.commit("Done"); // supersedes the first request
    });
    expect(latest.result?.value).toBe("Done");
    expect(latest.result?.pending).toBe(true);

    // The stale first request resolves late. It must not touch the current state.
    await act(async () => {
      resolveFirst?.();
      await Promise.resolve();
    });
    expect(latest.result?.value).toBe("Done");
    expect(latest.result?.pending).toBe(true); // still waiting on the second (real) commit

    // Now the second (current) request resolves for real.
    await act(async () => {
      resolveSecond?.();
      await Promise.resolve();
    });
    expect(latest.result?.pending).toBe(false);
    expect(latest.result?.value).toBe("Done");
  });

  it("does not let a slow, superseded request roll back a newer optimistic value on failure", async () => {
    let rejectFirst: ((cause: unknown) => void) | undefined;
    let callCount = 0;
    const { latest, render } = mount<string>({
      value: "To Do",
      mutate: () => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise((_resolve, reject) => {
            rejectFirst = reject;
          });
        }
        return new Promise(() => undefined); // second commit stays pending for this test
      },
    });

    await render("To Do");

    act(() => {
      latest.result?.commit("In Progress");
    });

    act(() => {
      latest.result?.commit("Done");
    });
    expect(latest.result?.value).toBe("Done");

    await act(async () => {
      rejectFirst?.(new Error("stale failure"));
      await Promise.resolve();
    });

    // The stale rejection must not roll back to "To Do" or clear the newer optimistic value/error.
    expect(latest.result?.value).toBe("Done");
    expect(latest.result?.error).toBeNull();
    expect(latest.result?.pending).toBe(true);
  });

  it("clears the optimistic value once the caller's reloaded value catches up", async () => {
    const { latest, render } = mount<string>({
      value: "To Do",
      mutate: () => Promise.resolve(),
    });

    await render("To Do");

    await act(async () => {
      latest.result?.commit("Done");
      await Promise.resolve();
    });
    expect(latest.result?.value).toBe("Done");
    expect(latest.result?.pending).toBe(false);

    // Simulate the caller's reload bringing the committed value up to date.
    await render("Done");
    expect(latest.result?.value).toBe("Done");
  });

  it("reset clears pending/error state and ignores the in-flight request's outcome", async () => {
    let resolveMutate: (() => void) | undefined;
    const { latest, render } = mount<string>({
      value: "To Do",
      mutate: () =>
        new Promise((resolve) => {
          resolveMutate = resolve;
        }),
    });

    await render("To Do");

    act(() => {
      latest.result?.commit("Done");
    });
    expect(latest.result?.pending).toBe(true);

    act(() => {
      latest.result?.reset();
    });
    expect(latest.result?.value).toBe("To Do");
    expect(latest.result?.pending).toBe(false);

    await act(async () => {
      resolveMutate?.();
      await Promise.resolve();
    });
    // The now-stale resolution must not resurrect pending state.
    expect(latest.result?.pending).toBe(false);
    expect(latest.result?.value).toBe("To Do");
  });

  it("shows lastChange after a successful commit, and clears it after the undo window", async () => {
    vi.useFakeTimers();
    try {
      const { latest, render } = mount<string>({ value: "To Do", mutate: () => Promise.resolve() });

      await render("To Do");
      await act(async () => {
        latest.result?.commit("In Progress");
        await Promise.resolve();
      });

      expect(latest.result?.lastChange).toEqual({ from: "To Do", to: "In Progress" });

      act(() => {
        vi.advanceTimersByTime(WORK_ITEM_FIELD_UNDO_WINDOW_MS - 1);
      });
      expect(latest.result?.lastChange).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(latest.result?.lastChange).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("undo re-commits the previous value through the same mutate path", async () => {
    const calls: string[] = [];
    const { latest, render } = mount<string>({
      value: "To Do",
      mutate: (nextValue) => {
        calls.push(nextValue);
        return Promise.resolve();
      },
    });

    await render("To Do");
    await act(async () => {
      latest.result?.commit("In Progress");
      await Promise.resolve();
    });
    expect(latest.result?.value).toBe("In Progress");

    await act(async () => {
      latest.result?.undo();
      await Promise.resolve();
    });

    expect(calls).toEqual(["In Progress", "To Do"]);
    expect(latest.result?.value).toBe("To Do");
    expect(latest.result?.lastChange).toEqual({ from: "In Progress", to: "To Do" });
  });

  it("starting a new commit clears any pending lastChange banner immediately", async () => {
    const { latest, render } = mount<string>({ value: "To Do", mutate: () => Promise.resolve() });

    await render("To Do");
    await act(async () => {
      latest.result?.commit("In Progress");
      await Promise.resolve();
    });
    expect(latest.result?.lastChange).not.toBeNull();

    act(() => {
      latest.result?.commit("Done");
    });
    expect(latest.result?.lastChange).toBeNull();
  });
});
