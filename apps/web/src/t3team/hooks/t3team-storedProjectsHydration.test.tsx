/** @vitest-environment jsdom */
/**
 * The cold-start regression this file exists for.
 *
 * `useHydrateStoredProjects` depended on its `input` object, and `useProjectStore` builds that
 * literal fresh on every render while re-rendering on every live snapshot during startup. Each of
 * those renders cancelled the in-flight `hydrateStoredProjects()` — an IPC round trip plus a full
 * client-settings parse — so the store could sit on the partial localStorage snapshot for the
 * whole session, and My Work scoped its digest to it. Hydration writes the merged list BACK to
 * localStorage, which is why navigating away and returning "fixed" it: the remount read the full
 * list synchronously.
 */
import { useReducer } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ClientSettings } from "@t3tools/contracts";
import type { ProjectShellProject } from "@t3tools/project-context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const settingsHolder: {
  get: () => Promise<ClientSettings | null>;
  calls: number;
} = { get: async () => null, calls: 0 };

vi.mock("~/localApi", () => ({
  readLocalApi: () => ({
    persistence: {
      getClientSettings: () => {
        settingsHolder.calls += 1;
        return settingsHolder.get();
      },
      setClientSettings: async () => undefined,
    },
  }),
}));

function makeProject(id: string): ProjectShellProject {
  return {
    id: id as never,
    title: id,
    source: { provider: "atlassian", accountId: "acct", externalProjectId: `ext-${id}` },
    workspace: { rootPath: `/tmp/${id}`, createdAt: "2026-05-01T00:00:00.000Z" },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  } as ProjectShellProject;
}

let host: HTMLElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  settingsHolder.calls = 0;
  const snapshot = await import("./t3team-storedProjectsSnapshot");
  snapshot.resetStoredProjectsSnapshotForTests();
  const persistence = await import("./t3team-projectStorePersistence");
  persistence.resetStoredProjectsHydrationForTests();
});

describe("stored project hydration", () => {
  it("applies the hydrated list even when the host re-renders before the promise resolves", async () => {
    let release: (settings: ClientSettings) => void = () => {};
    settingsHolder.get = () =>
      new Promise<ClientSettings>((resolve) => {
        release = resolve;
      });
    // The partial snapshot a cold start starts from.
    localStorage.setItem("t3team:projects", JSON.stringify([makeProject("local")]));

    const { useHydrateStoredProjects } = await import("./t3team-useHydrateStoredProjects");
    const applied: { projects: ProjectShellProject[]; selected: string | null } = {
      projects: [],
      selected: null,
    };
    let rerender: () => void = () => {};

    function Harness() {
      const [, bump] = useReducer((count: number) => count + 1, 0);
      rerender = bump;
      // A fresh object literal every render, exactly like useProjectStore builds.
      useHydrateStoredProjects({
        setStoredProjects: (next) => {
          applied.projects = typeof next === "function" ? next(applied.projects) : next;
        },
        setSelectedProjectId: (next) => {
          applied.selected = typeof next === "function" ? next(applied.selected) : next;
        },
        setExpandedProjectIds: () => {},
      });
      return null;
    }

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<Harness />);
    });

    // The startup storm: the project store re-renders on every live snapshot while the IPC round
    // trip is still out. Not one of these may cancel it.
    for (let index = 0; index < 5; index += 1) {
      await act(async () => rerender());
    }
    expect(applied.projects).toHaveLength(0);

    await act(async () => {
      release({ t3teamStoredProjectsJson: JSON.stringify([makeProject("persisted")]) } as never);
      await Promise.resolve();
    });

    // Both projects: hydration merges the persisted list with the local snapshot.
    expect(applied.projects.map((project) => String(project.id)).sort()).toEqual([
      "local",
      "persisted",
    ]);
    expect(applied.selected).not.toBeNull();
  });

  it("hydrates once per page and publishes the result to every reader", async () => {
    settingsHolder.get = async () =>
      ({
        t3teamStoredProjectsJson: JSON.stringify([makeProject("persisted")]),
      }) as never;

    const persistence = await import("./t3team-projectStorePersistence");
    const snapshot = await import("./t3team-storedProjectsSnapshot");
    expect(snapshot.readStoredProjectsSnapshot()).toBeNull();

    const [first, second] = await Promise.all([
      persistence.ensureStoredProjectsHydrated(),
      persistence.ensureStoredProjectsHydrated(),
    ]);
    // One IPC round trip, one list: the startup gate and the project store share both.
    expect(settingsHolder.calls).toBe(1);
    expect(first).toBe(second);
    expect(snapshot.readStoredProjectsSnapshot()).toBe(first);
  });

  it("republishes the list when a project is added or removed", async () => {
    settingsHolder.get = async () => null;
    const persistence = await import("./t3team-projectStorePersistence");
    const snapshot = await import("./t3team-storedProjectsSnapshot");
    await persistence.ensureStoredProjectsHydrated();

    const seen: number[] = [];
    const unsubscribe = snapshot.subscribeStoredProjectsSnapshot(() =>
      seen.push(snapshot.readStoredProjectsSnapshot()?.length ?? -1),
    );
    persistence.persistStoredProjects([makeProject("added")]);
    unsubscribe();

    expect(seen).toEqual([1]);
  });
});
