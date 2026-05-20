import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";

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

async function loadPersistenceModules() {
  const [
    { CLIENT_SETTINGS_STORAGE_KEY },
    { __resetLocalApiForTests },
    projectStoreUtils,
    persistence,
  ] = await Promise.all([
    import("~/clientPersistenceStorage"),
    import("~/localApi"),
    import("./t3work-projectStoreUtils"),
    import("./t3work-projectStorePersistence"),
  ]);

  return {
    CLIENT_SETTINGS_STORAGE_KEY,
    __resetLocalApiForTests,
    loadStoredProjects: projectStoreUtils.loadStoredProjects,
    saveStoredProjects: projectStoreUtils.saveStoredProjects,
    hydrateStoredProjects: persistence.hydrateStoredProjects,
    mergeStoredProjects: persistence.mergeStoredProjects,
    persistStoredProjects: persistence.persistStoredProjects,
    readStoredProjectsFromClientSettings: persistence.readStoredProjectsFromClientSettings,
  };
}

function makeStoredProject(overrides: Partial<ProjectShellProject> = {}): ProjectShellProject {
  return {
    id: "stored-project" as never,
    title: "Saved project",
    source: {
      provider: "atlassian",
      externalProjectId: "jira-123",
    },
    workspace: {
      rootPath: "/workspace/saved",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("t3work project store persistence", () => {
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

  it("reads persisted projects from client settings", async () => {
    const { readStoredProjectsFromClientSettings } = await loadPersistenceModules();
    const persistedProject = makeStoredProject({ id: "persisted-project" as never });

    expect(
      readStoredProjectsFromClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        t3workStoredProjectsJson: JSON.stringify([persistedProject]),
      }),
    ).toEqual([persistedProject]);
  });

  it("merges persisted and local projects by source", async () => {
    const { mergeStoredProjects } = await loadPersistenceModules();
    const persistedProject = makeStoredProject({ title: "Persisted project" });
    const localProject = makeStoredProject({
      id: "local-project" as never,
      title: "Local project",
    });

    expect(mergeStoredProjects([persistedProject], [localProject])).toEqual([localProject]);
  });

  it("hydrates local storage from persisted client settings", async () => {
    const { CLIENT_SETTINGS_STORAGE_KEY, hydrateStoredProjects, loadStoredProjects } =
      await loadPersistenceModules();
    const persistedProject = makeStoredProject({ id: "persisted-project" as never });
    localStorage.setItem(
      CLIENT_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_CLIENT_SETTINGS,
        t3workStoredProjectsJson: JSON.stringify([persistedProject]),
      }),
    );

    await expect(hydrateStoredProjects()).resolves.toEqual([persistedProject]);
    expect(loadStoredProjects()).toEqual([persistedProject]);
  });

  it("persists stored projects into client settings", async () => {
    const { CLIENT_SETTINGS_STORAGE_KEY, persistStoredProjects, saveStoredProjects } =
      await loadPersistenceModules();
    const persistedProject = makeStoredProject();
    saveStoredProjects([persistedProject]);

    persistStoredProjects([persistedProject]);

    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem(CLIENT_SETTINGS_STORAGE_KEY) ?? "null")).toMatchObject(
        {
          t3workStoredProjectsJson: JSON.stringify([persistedProject]),
        },
      );
    });
  });
});
