import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_PROVIDER_INTERACTION_MODE, DEFAULT_RUNTIME_MODE } from "@t3tools/contracts";

import { makeT3TeamOutboxEntry } from "~/t3team/outbox/t3team-outboxModel";
import {
  loadStoredOutboxEntries,
  persistOutboxEntry,
  removeStoredOutboxEntry,
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
