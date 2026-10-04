import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { makeT3TeamOutboxEntry } from "~/t3team/outbox/t3team-outboxModel";
import {
  acquireT3TeamOutboxDispatch,
  enqueueT3TeamOutboxEntry,
  getT3TeamOutboxEntriesForEnvironment,
  recordT3TeamOutboxFailure,
  recordT3TeamOutboxRetry,
  removeT3TeamOutboxEntry,
  releaseT3TeamOutboxDispatch,
  resetT3TeamOutboxStoreForTests,
  retryT3TeamOutboxEntry,
  getT3TeamOutboxSnapshot,
} from "~/t3team/outbox/t3team-outboxStore";
import { getOutboxAttemptTs, setOutboxAttempt } from "~/t3team/outbox/t3team-outboxStorage";

function entry(text: string, environmentId = "env-a") {
  return makeT3TeamOutboxEntry(
    "turn-start",
    {
      messageId: `m-${text}`,
      messageText: text,
      modelSelection: null,
      titleSeed: text,
      runtimeMode: "full-access" as never,
      interactionMode: "default" as never,
      createdAt: `2026-09-13T00:00:${text.length.toString().padStart(2, "0")}.000Z`,
    },
    environmentId,
    "thread-a",
  );
}

beforeEach(() => {
  const backing = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
    setItem: (k: string, v: string) => {
      backing.set(k, String(v));
    },
    removeItem: (k: string) => {
      backing.delete(k);
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size;
    },
  });
  resetT3TeamOutboxStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("enqueueT3TeamOutboxEntry", () => {
  it("adds entries FIFO per environment and dedupes by entry id", () => {
    const a = entry("a");
    const b = entry("b");
    enqueueT3TeamOutboxEntry(b);
    enqueueT3TeamOutboxEntry(a);
    enqueueT3TeamOutboxEntry({ ...a });
    const ids = getT3TeamOutboxEntriesForEnvironment("env-a").map((item) => item.entryId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(a.entryId);
    expect(ids).toContain(b.entryId);
  });

  it("keeps other environments separate", () => {
    enqueueT3TeamOutboxEntry(entry("a"));
    enqueueT3TeamOutboxEntry(entry("b", "env-b"));
    expect(getT3TeamOutboxEntriesForEnvironment("env-a")).toHaveLength(1);
    expect(getT3TeamOutboxEntriesForEnvironment("env-b")).toHaveLength(1);
  });

  it("returns false and does not enqueue when durable storage rejects the write", () => {
    (globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void }).setItem =
      () => {
        throw new Error("QuotaExceededError");
      };
    expect(enqueueT3TeamOutboxEntry(entry("nope"))).toBe(false);
    expect(getT3TeamOutboxEntriesForEnvironment("env-a")).toHaveLength(0);
  });
});

describe("removeT3TeamOutboxEntry", () => {
  it("removes only the named entry", () => {
    const a = entry("a");
    const b = entry("b");
    enqueueT3TeamOutboxEntry(a);
    enqueueT3TeamOutboxEntry(b);
    removeT3TeamOutboxEntry(a);
    const remaining = getT3TeamOutboxEntriesForEnvironment("env-a");
    expect(remaining.map((item) => item.entryId)).toEqual([b.entryId]);
  });
});

describe("dispatch lock", () => {
  it("lets one drain through and blocks concurrent ones", () => {
    expect(acquireT3TeamOutboxDispatch("e-1")).toBe(true);
    expect(acquireT3TeamOutboxDispatch("e-2")).toBe(false);
    releaseT3TeamOutboxDispatch();
    expect(acquireT3TeamOutboxDispatch("e-2")).toBe(true);
    releaseT3TeamOutboxDispatch();
  });

  it("discarding the in-flight head keeps the lock until the drain releases it", () => {
    const a = entry("a");
    enqueueT3TeamOutboxEntry(a);
    acquireT3TeamOutboxDispatch(a.entryId);
    removeT3TeamOutboxEntry(a);
    // N3: removing the entry must not release the in-flight dispatch lock — a
    // second entry must not start dispatching while this one is still running.
    expect(getT3TeamOutboxSnapshot().dispatchingEntryId).toBe(a.entryId);
    releaseT3TeamOutboxDispatch();
    expect(getT3TeamOutboxSnapshot().dispatchingEntryId).toBeNull();
  });
});

describe("retry backoff", () => {
  it("waits out the delay before the next drain tick", () => {
    vi.useFakeTimers();
    const a = entry("a");
    enqueueT3TeamOutboxEntry(a);
    recordT3TeamOutboxRetry(a.entryId);
    expect(getT3TeamOutboxSnapshot().retryNotBefore[a.entryId]).toBeGreaterThan(Date.now());
    const tickBefore = getT3TeamOutboxSnapshot().tick;
    vi.advanceTimersByTime(1000);
    const after = getT3TeamOutboxSnapshot();
    expect(after.retryNotBefore[a.entryId]).toBeUndefined();
    expect(after.tick).toBe(tickBefore + 1);
  });

  it("grows the delay across attempts for the same entry", () => {
    vi.useFakeTimers();
    const a = entry("a");
    enqueueT3TeamOutboxEntry(a);
    recordT3TeamOutboxRetry(a.entryId);
    vi.advanceTimersByTime(1000);
    const tickBefore = getT3TeamOutboxSnapshot().tick;
    recordT3TeamOutboxRetry(a.entryId);
    vi.advanceTimersByTime(1999);
    expect(getT3TeamOutboxSnapshot().tick).toBe(tickBefore);
    vi.advanceTimersByTime(1);
    expect(getT3TeamOutboxSnapshot().tick).toBe(tickBefore + 1);
  });

  it("manual retry clears the backoff and bumps the tick", () => {
    const a = entry("a");
    enqueueT3TeamOutboxEntry(a);
    recordT3TeamOutboxFailure(a.entryId, "boom");
    const tickBefore = getT3TeamOutboxSnapshot().tick;
    retryT3TeamOutboxEntry(a.entryId);
    const after = getT3TeamOutboxSnapshot();
    expect(after.failures[a.entryId]).toBeUndefined();
    expect(after.tick).toBeGreaterThan(tickBefore);
  });

  it("manual retry also clears the durable attempt shield", () => {
    const a = entry("a");
    enqueueT3TeamOutboxEntry(a);
    setOutboxAttempt(a.entryId);
    retryT3TeamOutboxEntry(a.entryId);
    expect(getOutboxAttemptTs(a.entryId)).toBeNull();
  });

  it("removal clears backoff state", () => {
    vi.useFakeTimers();
    const a = entry("a");
    enqueueT3TeamOutboxEntry(a);
    recordT3TeamOutboxRetry(a.entryId);
    removeT3TeamOutboxEntry(a);
    vi.advanceTimersByTime(60_000);
    const after = getT3TeamOutboxSnapshot();
    expect(after.retryNotBefore).toEqual({});
    expect(after.entries).toEqual([]);
  });
});
