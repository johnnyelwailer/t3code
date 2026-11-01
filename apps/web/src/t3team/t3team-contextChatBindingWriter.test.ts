import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// The writer's logic is injected; these keep the module's live wiring out of a node test.
vi.mock("~/state/entities", () => ({ waitForThreadShell: vi.fn() }));
vi.mock("~/components/ui/toast", () => ({ toastManager: { add: vi.fn() } }));
vi.mock("./t3team-contextChatBindingRpc", () => ({ recordContextBindingRemote: vi.fn() }));

import {
  THREAD_NOT_FOUND_MESSAGE,
  classifyBindingFailure,
} from "./t3team-contextChatBindingOutcome";
import type { BindingWriteOutcome } from "./t3team-contextChatBindingOutcome";
import {
  type BindingWriterDeps,
  MAX_WRITE_ATTEMPTS,
  PENDING_TTL_MS,
  SHELL_WAIT_ROUNDS,
  kickAllPendingBindings,
  kickPendingBinding,
  settlePendingBinding,
} from "./t3team-contextChatBindingWriter";
import { myWorkContextBinding } from "./t3team-contextChatBinding";
import {
  type PendingContextBinding,
  pendingBindingKey,
  useContextChatPendingStore,
} from "./t3team-contextChatPendingStore";

const ENVIRONMENT = EnvironmentId.make("env-1");
const NOW = 1_800_000_000_000;
const entry: PendingContextBinding = {
  environmentId: ENVIRONMENT,
  threadId: ThreadId.make("thread-1"),
  binding: myWorkContextBinding(ProjectId.make("scratch")),
  queuedAt: NOW,
};
const key = pendingBindingKey(ENVIRONMENT, entry.threadId);
const isPending = () => useContextChatPendingStore.getState().pending[key] !== undefined;

/** Deps whose outcomes are scripted in order; the last one repeats. */
function fakeDeps(outcomes: ReadonlyArray<BindingWriteOutcome>, shell: boolean | boolean[] = true) {
  const shells = Array.isArray(shell) ? [...shell] : null;
  const calls = { record: 0, waits: 0, refused: [] as string[], slept: [] as number[] };
  const deps: BindingWriterDeps = {
    record: async () => outcomes[Math.min(calls.record++, outcomes.length - 1)]!,
    waitForShell: async () => {
      calls.waits += 1;
      return shells ? (shells.shift() ?? false) : shell === true;
    },
    clear: (cleared) =>
      useContextChatPendingStore.getState().clearPending(cleared.environmentId, cleared.threadId),
    onRefused: (_entry, message) => calls.refused.push(message),
    sleep: async (ms) => void calls.slept.push(ms),
    now: () => NOW,
  };
  return { deps, calls };
}

beforeEach(() => useContextChatPendingStore.setState({ pending: {}, activeByBindingKey: {} }));

describe("settlePendingBinding", () => {
  it("clears the entry only once the server acknowledged it", async () => {
    useContextChatPendingStore.getState().addPending(entry);
    const { deps } = fakeDeps([{ kind: "bound" }]);
    expect(await settlePendingBinding(entry, deps)).toBe("bound");
    expect(isPending()).toBe(false);
  });

  it("keeps the entry while the server is unavailable, and a later mount recovers it", async () => {
    useContextChatPendingStore.getState().addPending(entry);
    const down = fakeDeps([{ kind: "unavailable", message: "offline" }]);
    expect(await settlePendingBinding(entry, down.deps)).toBe("deferred");
    expect(down.calls.record).toBe(MAX_WRITE_ATTEMPTS);
    expect(isPending()).toBe(true);

    // The next mount retries every pending entry from the store.
    const up = fakeDeps([{ kind: "bound" }]);
    kickAllPendingBindings(up.deps);
    await vi.waitFor(() => expect(isPending()).toBe(false));
    expect(up.calls.record).toBe(1);
  });

  it("retries an unknown thread with a growing backoff, a bounded number of times", async () => {
    useContextChatPendingStore.getState().addPending(entry);
    const { deps, calls } = fakeDeps([{ kind: "thread-not-found" }]);
    expect(await settlePendingBinding(entry, deps)).toBe("deferred");
    expect(calls.record).toBe(MAX_WRITE_ATTEMPTS);
    expect(calls.slept).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect(isPending()).toBe(true);
  });

  it("succeeds when the thread becomes known on a retry", async () => {
    useContextChatPendingStore.getState().addPending(entry);
    const { deps, calls } = fakeDeps([
      { kind: "thread-not-found" },
      { kind: "thread-not-found" },
      { kind: "bound" },
    ]);
    expect(await settlePendingBinding(entry, deps)).toBe("bound");
    expect(calls.record).toBe(3);
    expect(isPending()).toBe(false);
  });

  it("surfaces a refusal once, clears it and never retries it", async () => {
    useContextChatPendingStore.getState().addPending(entry);
    const { deps, calls } = fakeDeps([
      { kind: "refused", message: "The thread is already bound to another context." },
    ]);
    expect(await settlePendingBinding(entry, deps)).toBe("refused");
    expect(calls.record).toBe(1);
    expect(calls.refused).toEqual(["The thread is already bound to another context."]);
    expect(isPending()).toBe(false);
  });

  it("waits for the thread shell, and defers when it never shows up", async () => {
    useContextChatPendingStore.getState().addPending(entry);
    const late = fakeDeps([{ kind: "bound" }], [false, false, true]);
    expect(await settlePendingBinding(entry, late.deps)).toBe("bound");
    expect(late.calls.waits).toBe(3);

    useContextChatPendingStore.getState().addPending(entry);
    const never = fakeDeps([{ kind: "bound" }], false);
    expect(await settlePendingBinding(entry, never.deps)).toBe("deferred");
    expect(never.calls.waits).toBe(SHELL_WAIT_ROUNDS);
    expect(never.calls.record).toBe(0);
    expect(isPending()).toBe(true);
  });

  it("gives up on a thread that never appeared once the entry is older than the ttl", async () => {
    const stale = { ...entry, queuedAt: NOW - PENDING_TTL_MS - 1 };
    useContextChatPendingStore.getState().addPending(stale);
    const { deps } = fakeDeps([{ kind: "bound" }], false);
    expect(await settlePendingBinding(stale, deps)).toBe("expired");
    expect(isPending()).toBe(false);
  });

  it("settles one entry at a time", async () => {
    useContextChatPendingStore.getState().addPending(entry);
    const { deps, calls } = fakeDeps([{ kind: "bound" }]);
    const first = kickPendingBinding(entry, deps);
    expect(await kickPendingBinding(entry, deps)).toBe("in-flight");
    expect(await first).toBe("bound");
    expect(calls.record).toBe(1);
  });
});

describe("classifyBindingFailure", () => {
  const tagged = (message: string) => ({ _tag: "T3TeamContextBindingError", message });
  it("sorts the server's refusals by what a retry can do", () => {
    expect(classifyBindingFailure(tagged(THREAD_NOT_FOUND_MESSAGE))).toEqual({
      kind: "thread-not-found",
    });
    expect(
      classifyBindingFailure(tagged("The thread is already bound to another context.")),
    ).toEqual({ kind: "refused", message: "The thread is already bound to another context." });
    expect(classifyBindingFailure(new Error("socket closed"))).toEqual({
      kind: "unavailable",
      message: "socket closed",
    });
  });
});

describe("the pending store across a reload", () => {
  it("restores pending entries and the active chat from storage", async () => {
    const backing = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (name: string) => backing.get(name) ?? null,
        setItem: (name: string, value: string) => void backing.set(name, value),
        removeItem: (name: string) => void backing.delete(name),
      },
    });
    try {
      vi.resetModules();
      const before = await import("./t3team-contextChatPendingStore");
      before.useContextChatPendingStore.getState().addPending(entry);
      before.useContextChatPendingStore.getState().setActive("binding-key", {
        environmentId: ENVIRONMENT,
        threadId: entry.threadId,
      });
      // A crash after the thread was created and before the write was acknowledged: a new
      // module instance is a fresh process reading the same storage.
      vi.resetModules();
      const after = await import("./t3team-contextChatPendingStore");
      expect(after.useContextChatPendingStore.getState().pending[key]).toEqual(entry);
      expect(after.useContextChatPendingStore.getState().activeByBindingKey["binding-key"]).toEqual(
        {
          environmentId: ENVIRONMENT,
          threadId: entry.threadId,
        },
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the first entry for a thread, so a resend does not extend its ttl", () => {
    const store = useContextChatPendingStore.getState();
    store.addPending(entry);
    store.addPending({ ...entry, queuedAt: NOW + 5_000 });
    expect(useContextChatPendingStore.getState().pending[key]?.queuedAt).toBe(NOW);
  });
});
