import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_PROVIDER_INTERACTION_MODE, DEFAULT_RUNTIME_MODE } from "@t3tools/contracts";

import { makeT3TeamOutboxEntry } from "~/t3team/outbox/t3team-outboxModel";
import {
  acquireOutboxDispatch,
  clearOutboxAttempt,
  getOutboxAttemptTs,
  loadStoredOutboxEntries,
  persistOutboxEntry,
  removeStoredOutboxEntry,
  releaseOutboxDispatch,
  setOutboxAttempt,
  storedOutboxEntryExists,
} from "~/t3team/outbox/t3team-outboxStorage";

class FakeLocalStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

let storage: FakeLocalStorage;

beforeEach(() => {
  storage = new FakeLocalStorage();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function entry(text: string) {
  return makeT3TeamOutboxEntry(
    "turn-start",
    {
      messageId: `m-${text}`,
      messageText: text,
      modelSelection: null,
      titleSeed: text,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      createdAt: "2026-09-13T00:00:00.000Z",
    },
    "env-a",
    "thread-a",
  );
}

describe("outbox storage", () => {
  it("round-trips entries through persistence", () => {
    const first = entry("one");
    const second = entry("two");
    expect(persistOutboxEntry(first)).toBe(true);
    expect(persistOutboxEntry(second)).toBe(true);
    const loaded = loadStoredOutboxEntries();
    expect(loaded).toEqual([first, second]);
  });

  it("removes a persisted entry", () => {
    const first = entry("one");
    persistOutboxEntry(first);
    removeStoredOutboxEntry(first);
    expect(loadStoredOutboxEntries()).toEqual([]);
  });

  it("ignores foreign keys and drops corrupt records", () => {
    const first = entry("one");
    persistOutboxEntry(first);
    storage.setItem("unrelated:key", "{}");
    storage.setItem("t3team-outbox:v1:corrupt", "{not json");
    const loaded = loadStoredOutboxEntries();
    expect(loaded).toEqual([first]);
    expect(storage.getItem("unrelated:key")).toEqual("{}");
    expect(storage.getItem("t3team-outbox:v1:corrupt")).toBeNull();
  });
});

describe("cross-tab dispatch claim", () => {
  const CLAIM = (id: string) => `t3team-outbox:claim:v1:${id}`;

  it("defers when a fresh claim owned by another tab exists", () => {
    storage.setItem(CLAIM("e-foreign"), JSON.stringify({ ts: Date.now(), owner: "other-tab" }));
    expect(acquireOutboxDispatch("e-foreign")).toBe(false);
  });

  it("takes over once a foreign claim has gone stale", () => {
    storage.setItem(
      CLAIM("e-stale"),
      JSON.stringify({ ts: Date.now() - 120_000, owner: "other-tab" }),
    );
    expect(acquireOutboxDispatch("e-stale")).toBe(true);
  });

  it("releases only this tab's claim, leaving a foreign one intact", () => {
    storage.setItem(CLAIM("e-mine"), JSON.stringify({ ts: Date.now(), owner: "other-tab" }));
    releaseOutboxDispatch("e-mine");
    expect(storage.getItem(CLAIM("e-mine"))).not.toBeNull();
  });

  it("acquires and then releases this tab's own claim", () => {
    expect(acquireOutboxDispatch("e-own")).toBe(true);
    releaseOutboxDispatch("e-own");
    expect(storage.getItem(CLAIM("e-own"))).toBeNull();
  });
});

describe("durable entry presence and attempt timestamp", () => {
  it("tracks presence and a clearable attempt marker", () => {
    const first = entry("one");
    persistOutboxEntry(first);
    expect(storedOutboxEntryExists(first.entryId)).toBe(true);
    setOutboxAttempt(first.entryId);
    expect(getOutboxAttemptTs(first.entryId)).toBeTypeOf("number");
    clearOutboxAttempt(first.entryId);
    expect(getOutboxAttemptTs(first.entryId)).toBeNull();
    removeStoredOutboxEntry(first);
    expect(storedOutboxEntryExists(first.entryId)).toBe(false);
  });

  it('fails open when the store is unreadable (an error must not read as "gone")', () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("storage unavailable");
      },
    });
    expect(storedOutboxEntryExists("any-id")).toBe(true);
  });
});
