import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";

import { getProjectDashboardModeStorageKey } from "~/t3team/t3team-projectDashboardModeState";
import type { ProjectThread } from "~/t3team/t3team-types";

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

function makeStoredThread(overrides: Partial<ProjectThread> = {}): ProjectThread {
  return {
    id: "thread-123",
    projectId: "project-123",
    title: "Ticket kickoff 1",
    status: "idle",
    lastMessageAt: "2026-05-22T10:00:00.000Z",
    messageCount: 0,
    createdAt: "2026-05-22T10:00:00.000Z",
    kickoffPending: true,
    kickoffMessage: "Investigate the issue",
    selectedToolIds: ["t3team.view.read"],
    ...overrides,
  };
}

async function loadPersistenceModules() {
  const [{ CLIENT_SETTINGS_STORAGE_KEY }, { __resetLocalApiForTests }, persistence] =
    await Promise.all([
      import("~/clientPersistenceStorage"),
      import("~/localApi"),
      import("./t3team-projectThreadPersistence"),
    ]);

  return {
    CLIENT_SETTINGS_STORAGE_KEY,
    __resetLocalApiForTests,
    hydrateStoredThreads: persistence.hydrateStoredThreads,
    mergeStoredThreads: persistence.mergeStoredThreads,
    persistStoredThreads: persistence.persistStoredThreads,
    readStoredThreadsFromClientSettings: persistence.readStoredThreadsFromClientSettings,
  };
}

describe("t3team project thread persistence", () => {
  beforeEach(async () => {
    vi.resetModules();
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
      writable: true,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: storage,
        confirm: vi.fn(),
        location: { origin: "http://127.0.0.1:5733" },
        open: vi.fn(),
      },
      writable: true,
    });
    const { __resetLocalApiForTests } = await loadPersistenceModules();
    await __resetLocalApiForTests();
    localStorage.clear();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("reads persisted threads from client settings", async () => {
    const { readStoredThreadsFromClientSettings } = await loadPersistenceModules();
    const persistedThread = makeStoredThread({ dashboardMode: "backlog" });

    expect(
      readStoredThreadsFromClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        t3teamStoredThreadsJson: JSON.stringify([persistedThread]),
      }),
    ).toEqual([persistedThread]);
  });

  it("merges persisted and legacy local threads by id, preferring the legacy shadow state", async () => {
    const { mergeStoredThreads } = await loadPersistenceModules();
    const persistedThread = makeStoredThread({
      title: "Persisted title",
      dashboardMode: "backlog",
    });
    const legacyThread = makeStoredThread({ title: "Legacy title", dashboardMode: "my-work" });

    expect(mergeStoredThreads([persistedThread], [legacyThread])).toEqual([legacyThread]);
  });

  it("hydrates threads from client settings", async () => {
    const { CLIENT_SETTINGS_STORAGE_KEY, hydrateStoredThreads } = await loadPersistenceModules();
    const persistedThread = makeStoredThread({ dashboardMode: "backlog" });
    localStorage.setItem(
      CLIENT_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_CLIENT_SETTINGS,
        t3teamStoredThreadsJson: JSON.stringify([persistedThread]),
      }),
    );

    await expect(hydrateStoredThreads()).resolves.toEqual([persistedThread]);
  });

  it("persists threads into client settings instead of the legacy raw local storage key", async () => {
    const { CLIENT_SETTINGS_STORAGE_KEY, persistStoredThreads } = await loadPersistenceModules();
    const persistedThread = makeStoredThread({ dashboardMode: "backlog" });

    persistStoredThreads([persistedThread]);

    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem(CLIENT_SETTINGS_STORAGE_KEY) ?? "null")).toMatchObject(
        {
          t3teamStoredThreadsJson: JSON.stringify([persistedThread]),
        },
      );
    });
    expect(localStorage.getItem("t3team:threads")).toBeNull();
  });

  it("migrates legacy raw local storage threads into backend-backed client settings", async () => {
    const { CLIENT_SETTINGS_STORAGE_KEY, hydrateStoredThreads } = await loadPersistenceModules();
    const legacyThread = makeStoredThread({ title: "Project kickoff" });

    localStorage.setItem(
      getProjectDashboardModeStorageKey(legacyThread.projectId),
      JSON.stringify({ dashboardMode: "backlog" }),
    );
    localStorage.setItem("t3team:threads", JSON.stringify([legacyThread]));

    await expect(hydrateStoredThreads()).resolves.toEqual([
      { ...legacyThread, dashboardMode: "backlog" },
    ]);
    expect(localStorage.getItem("t3team:threads")).toBeNull();
    expect(JSON.parse(localStorage.getItem(CLIENT_SETTINGS_STORAGE_KEY) ?? "null")).toMatchObject({
      t3teamStoredThreadsJson: JSON.stringify([{ ...legacyThread, dashboardMode: "backlog" }]),
    });
  });
});
